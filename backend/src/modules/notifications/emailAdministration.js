import prisma from '../../config/database.js';
import { readPage, transaction } from '../../utils/phase04.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import auditService from '../audit/auditService.js';
import { deliveryConfiguration } from '../../integrations/email/emailConfig.js';
import { previewEmail } from '../../integrations/email/emailService.js';
import { assertEmailAdministration } from './notificationAccess.js';
import { effectiveReminders, remindersKey } from './notificationWorker.js';

export const emailStatuses = ['PENDING', 'PROCESSING', 'RETRY_SCHEDULED', 'SENT', 'FAILED', 'CANCELLED', 'CAPTURED'];
const emailFields = { id: true, templateKey: true, templateVersion: true, status: true, attemptCount: true,
  maximumAttempts: true, availableAt: true, nextAttemptAt: true, processingStartedAt: true, sentAt: true, lastErrorCode: true,
  providerMessageId: true, createdAt: true, updatedAt: true };
const safeAttempt = { id: true, sequence: true, startedAt: true, finishedAt: true, outcome: true,
  errorCode: true, providerMessageId: true };
const missing = () => new NotFoundError('Email job not found.');
const conflict = (message) => new AppError(message, 409, 'EMAIL_STATE_CONFLICT');

export function outbox(req, query) {
  assertEmailAdministration(req);
  return readPage(prisma.emailOutbox, { where: { status: query.status,
    ...(query.search ? { templateKey: { contains: query.search } } : {}) },
    select: emailFields, orderBy: [{ createdAt: query.sort }, { id: 'asc' }] }, query);
}

export async function emailJob(req, id) {
  assertEmailAdministration(req);
  const row = await prisma.emailOutbox.findUnique({ where: { id }, select: { ...emailFields, templateData: true } });
  if (!row) throw missing();
  const { templateData, ...metadata } = row;
  const config = deliveryConfiguration();
  let preview = null;
  if (row.status === 'CAPTURED' && config.mode === 'CAPTURE' && !config.errorCode && process.env.NODE_ENV !== 'production') {
    try { preview = previewEmail({ ...row, templateData }, config); } catch { /* Fixed metadata remains available. */ }
  }
  return { ...metadata, preview };
}

export async function attempts(req, id, query) {
  assertEmailAdministration(req);
  if (!await prisma.emailOutbox.count({ where: { id } })) throw missing();
  return readPage(prisma.emailDeliveryAttempt, { where: { emailOutboxId: id }, select: safeAttempt,
    orderBy: [{ sequence: query.sort }, { id: 'asc' }] }, query);
}

export function changeJob(req, id, action, input, requestId) {
  assertEmailAdministration(req, true);
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM email_outbox WHERE id = ${id} FOR UPDATE`;
    const before = await tx.emailOutbox.findUnique({ where: { id }, select: emailFields });
    if (!before) throw missing();
    const retry = action === 'retry';
    if (retry && (before.status !== 'FAILED' || before.attemptCount >= 12
      || (before.lastErrorCode === 'DELIVERY_AMBIGUOUS' && !input.confirmAmbiguous))) {
      throw conflict('Retry requires a failed eligible job and confirmation of any ambiguous delivery.');
    }
    if (!retry && !['PENDING', 'RETRY_SCHEDULED', 'FAILED'].includes(before.status)) {
      throw conflict('This job cannot be cancelled in its current state.');
    }
    const now = new Date();
    const row = await tx.emailOutbox.update({ where: { id }, data: retry
      ? { status: 'RETRY_SCHEDULED', availableAt: now, nextAttemptAt: now, lastErrorCode: null,
        maximumAttempts: Math.max(before.maximumAttempts, before.attemptCount + 1) }
      : { status: 'CANCELLED', lastErrorCode: 'CANCELLED_BY_ADMIN' }, select: emailFields });
    await auditService.createAuditLog(tx, { actorUserId: req.user.id, requestId, resourceType: 'EMAIL_OUTBOX',
      resourceId: id, action: retry ? 'EMAIL_RETRY_REQUESTED' : 'EMAIL_JOB_CANCELLED',
      beforeState: { status: before.status }, afterState: { status: row.status, confirmedAmbiguous: Boolean(input.confirmAmbiguous) } });
    return row;
  });
}

export async function notificationStats(req) {
  assertEmailAdministration(req);
  const [total, unread, groups] = await Promise.all([
    prisma.notification.count(), prisma.notification.count({ where: { readAt: null, archivedAt: null } }),
    prisma.emailOutbox.groupBy({ by: ['status'], _count: { _all: true } })
  ]);
  return { total, unread, emails: Object.fromEntries(emailStatuses.map((status) =>
    [status, groups.find((row) => row.status === status)?._count._all ?? 0])) };
}

export async function workerStatus(req) {
  assertEmailAdministration(req);
  const workers = await prisma.notificationWorkerState.findMany({ orderBy: { heartbeatAt: 'desc' }, take: 15,
    select: { mode: true, status: true, heartbeatAt: true, lastErrorCode: true } });
  const current = workers.filter((row) => row.status !== 'STOPPED' && Date.now() - +row.heartbeatAt <= 90_000);
  return { status: !current.length ? 'OFFLINE' : current.some((row) => row.status === 'RUNNING') ? 'RUNNING' : 'DEGRADED',
    workers, reminders: await effectiveReminders(prisma) };
}

export function saveReminderSettings(req, data, requestId) {
  assertEmailAdministration(req, true);
  return transaction(async (tx) => {
    const before = await effectiveReminders(tx);
    const record = await tx.systemSetting.upsert({ where: { key: remindersKey }, update: { value: JSON.stringify(data) },
      create: { key: remindersKey, value: JSON.stringify(data), category: 'notifications', description: 'Scheduler reminder windows' } });
    await auditService.createAuditLog(tx, { actorUserId: req.user.id, requestId, resourceType: 'SYSTEM_SETTING',
      resourceId: record.id, action: 'NOTIFICATION_REMINDERS_UPDATED', beforeState: before, afterState: data });
    return data;
  });
}
