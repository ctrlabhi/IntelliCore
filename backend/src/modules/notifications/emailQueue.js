import { z } from 'zod';
import { deliverEmail } from '../../integrations/email/emailService.js';
import { eligibleWhere, historicalWhere } from '../work/workAccess.js';
import { policyFor, recipientWhere } from './notificationPolicy.js';

export const leaseMs = 60_000;
const integer = (minimum, maximum, fallback) => z.coerce.number().int().min(minimum).max(maximum).catch(fallback);
export const maximumAttempts = (source = process.env) => integer(1, 10, 5).parse(source.EMAIL_MAX_ATTEMPTS);
export const workerOptions = (source = process.env) => ({
  batch: integer(1, 10, 5).parse(source.NOTIFICATION_BATCH_SIZE),
  intervalMs: integer(2000, 30000, 5000).parse(source.NOTIFICATION_POLL_MS),
  retryBaseMs: integer(15, 1800, 60).parse(source.EMAIL_RETRY_BASE_SECONDS) * 1000,
  retryCapMs: integer(60, 86400, 3600).parse(source.EMAIL_RETRY_CAP_SECONDS) * 1000
});
const transactional = { isolationLevel: 'ReadCommitted', timeout: 12000 };

export async function claimEmails(client, workerId, now, batch = 5) {
  return client.$transaction(async (tx) => {
    const expired = await tx.$queryRaw`
      SELECT id FROM email_outbox WHERE status='PROCESSING' AND lease_expires_at <= ${now}
      ORDER BY lease_expires_at, id LIMIT ${batch} FOR UPDATE SKIP LOCKED`;
    for (const { id } of expired) {
      const job = await tx.emailOutbox.findUniqueOrThrow({ where: { id } });
      const key = { emailOutboxId_sequence: { emailOutboxId: id, sequence: job.attemptCount } };
      const last = await tx.emailDeliveryAttempt.findUnique({ where: key });
      const ambiguous = last?.outcome === 'DELIVERING';
      const exhausted = job.attemptCount >= job.maximumAttempts;
      const errorCode = ambiguous ? 'DELIVERY_AMBIGUOUS' : exhausted ? 'RETRY_EXHAUSTED' : 'WORKER_LEASE_EXPIRED';
      await tx.emailDeliveryAttempt.updateMany({ where: { emailOutboxId: id, sequence: job.attemptCount, finishedAt: null },
        data: { outcome: 'LEASE_EXPIRED', finishedAt: now, errorCode } });
      await tx.emailOutbox.update({ where: { id }, data: {
        status: ambiguous || exhausted ? 'FAILED' : 'RETRY_SCHEDULED', nextAttemptAt: now, lastErrorCode: errorCode,
        workerId: null, leaseExpiresAt: null, processingStartedAt: null
      } });
    }
    const available = await tx.$queryRaw`
      SELECT id FROM email_outbox
      WHERE status IN ('PENDING','RETRY_SCHEDULED') AND next_attempt_at <= ${now}
        AND available_at <= ${now} AND attempt_count < maximum_attempts
      ORDER BY next_attempt_at, id LIMIT ${batch} FOR UPDATE SKIP LOCKED`;
    const jobs = [];
    for (const { id } of available) {
      const row = await tx.emailOutbox.update({ where: { id }, data: { status: 'PROCESSING',
        workerId, processingStartedAt: now, leaseExpiresAt: new Date(+now + leaseMs), attemptCount: { increment: 1 } } });
      await tx.emailDeliveryAttempt.create({ data: {
        emailOutboxId: id, sequence: row.attemptCount, startedAt: now, outcome: 'CLAIMED'
      } });
      jobs.push(row);
    }
    return jobs;
  }, transactional);
}

export function retryAt(now, attempt, { retryBaseMs, retryCapMs }, random = Math.random) {
  const cap = Math.min(retryCapMs, retryBaseMs * 2 ** (attempt - 1));
  return new Date(+now + Math.round(cap * (0.8 + 0.2 * random())));
}

const claimWhere = (job, now) => ({ id: job.id, status: 'PROCESSING', workerId: job.workerId,
  attemptCount: job.attemptCount, leaseExpiresAt: { gt: now } });

async function markDeliveryStarted(client, job, now) {
  return client.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`SELECT id FROM email_outbox WHERE id = ${job.id} FOR UPDATE`;
    if (!locked.length || !await tx.emailOutbox.count({ where: claimWhere(job, now) })) return false;
    await tx.emailDeliveryAttempt.update({ where: { emailOutboxId_sequence: { emailOutboxId: job.id, sequence: job.attemptCount } },
      data: { outcome: 'DELIVERING' } });
    return true;
  }, transactional);
}

export async function finishJob(client, job, outcome, now, options, random) {
  let { status, errorCode } = outcome;
  if (status === 'RETRY_SCHEDULED' && job.attemptCount >= job.maximumAttempts) {
    status = 'FAILED';
    errorCode = 'RETRY_EXHAUSTED';
  }
  return client.$transaction(async (tx) => {
    const changed = await tx.emailOutbox.updateMany({ where: claimWhere(job, now), data: {
      status, lastErrorCode: errorCode ?? null, providerMessageId: outcome.providerMessageId ?? null,
      sentAt: status === 'SENT' ? now : null, workerId: null, leaseExpiresAt: null, processingStartedAt: null,
      nextAttemptAt: status === 'RETRY_SCHEDULED' ? retryAt(now, job.attemptCount, options, random) : now
    } });
    if (!changed.count) return false;
    await tx.emailDeliveryAttempt.update({ where: { emailOutboxId_sequence: {
      emailOutboxId: job.id, sequence: job.attemptCount } }, data: {
      outcome: status, finishedAt: now, errorCode: errorCode ?? null, providerMessageId: outcome.providerMessageId ?? null
    } });
    return true;
  }, transactional);
}

async function stillAuthorized(client, job, now) {
  const policy = policyFor(job.templateData.event);
  const { type, resourceId, rule, departmentId, version } = job.authorization;
  const id = job.recipientUserId;
  if (!await client.user.count({ where: {
    id, email: job.recipientEmail, emailVerified: true,
    status: { in: policy.onboarding ? ['PENDING', 'ACTIVE', 'REJECTED'] : ['ACTIVE'] },
    OR: [{ notificationPreference: null }, { notificationPreference: { emailEnabled: true,
      ...(policy.preference ? { [policy.preference]: true } : {}) } }],
    ...(rule ? { AND: [recipientWhere(rule, departmentId)] } : {})
  } })) return false;
  if (type === 'INTERNSHIP_APPLICATION') {
    const event = job.templateData.event;
    return Boolean(await client.internshipApplication.count({ where: { id: resourceId, applicantUserId: id,
      ...(event === 'APPLICATION_SUBMITTED' ? { submittedAt: new Date(version) } : { reviewedAt: new Date(version) }),
      ...(event === 'APPLICATION_CHANGES_REQUESTED' ? { applicationStatus: 'CHANGES_REQUESTED' } : {}) } }));
  }
  if (type === 'INTERNSHIP') return Boolean(await client.internship.count({ where: { id: resourceId, userId: id, internshipStatus: 'COMPLETED' } }));
  if (type === 'LEAVE_REQUEST') return Boolean(await client.leaveRequest.count({ where: { id: resourceId, internship: { userId: id },
    status: job.templateData.event === 'LEAVE_APPROVED' ? 'APPROVED' : 'REJECTED' } }));
  if (type === 'ATTENDANCE_CORRECTION') return Boolean(await client.attendanceCorrection.count({ where: { id: resourceId,
    requestedBy: id, status: job.templateData.event === 'CORRECTION_APPROVED' ? 'APPROVED' : 'REJECTED' } }));
  if (type === 'TASK_ASSIGNMENT') {
    const event = job.templateData.event;
    const reminder = event === 'TASK_DEADLINE_REMINDER';
    const current = ['TASK_ASSIGNED', 'TASK_DEADLINE_REMINDER'].includes(event);
    const row = await client.taskAssignment.findFirst({ where: {
      id: resourceId, assignedTo: id, status: { not: 'CANCELLED' },
      internship: current ? { ...eligibleWhere(now), userId: id } : historicalWhere(id, now),
      ...(current ? { task: { status: 'PUBLISHED' } } : {})
    }, select: { status: true, dueAt: true, task: { select: { dueAt: true } } } });
    if (!row) return false;
    if (event === 'TASK_REVISION_REQUESTED') return row.status === 'REVISION_REQUESTED';
    if (!reminder) return true;
    const deadline = row.dueAt ?? row.task.dueAt;
    return ['ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUESTED'].includes(row.status)
      && deadline > now && deadline.toISOString() === version;
  }
  return false;
}

export async function processEmailJob(client, job, config, options, { clock = () => new Date(), createTransport, random } = {}) {
  let outcome;
  if (config.mode === 'DISABLED') {
    outcome = { status: 'CANCELLED', errorCode: 'DELIVERY_DISABLED' };
  } else if (!await stillAuthorized(client, job, clock())) {
    outcome = { status: 'CANCELLED', errorCode: 'RECIPIENT_NO_LONGER_ELIGIBLE' };
  } else {
    if (config.mode === 'SMTP' && !await markDeliveryStarted(client, job, clock())) return null;
    if (job.leaseExpiresAt <= new Date(+clock() + 21000)) return null;
    outcome = await deliverEmail(job, config, { createTransport });
  }
  await finishJob(client, job, outcome, clock(), options, random);
  return outcome;
}
