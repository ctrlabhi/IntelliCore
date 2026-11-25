import { deliveryConfiguration } from '../../integrations/email/emailConfig.js';
import { claimEmails, processEmailJob, workerOptions } from './emailQueue.js';
import { publishScheduled } from './announcementService.js';
import { reminderOptions, runReminders } from './reminderService.js';

export const remindersKey = 'notifications.reminders';

export async function effectiveReminders(client) {
  const setting = await client.systemSetting.findUnique({ where: { key: remindersKey }, select: { value: true } });
  return setting ? JSON.parse(setting.value) : reminderOptions();
}

export async function heartbeat(client, id, mode, status, heartbeatAt, lastErrorCode = null) {
  const data = { mode, status, heartbeatAt, lastErrorCode };
  await client.notificationWorkerState.upsert({ where: { id }, create: { id, ...data }, update: data });
}

export async function runNotificationTick(client, workerId, {
  clock = () => new Date(), config = deliveryConfiguration(), options = workerOptions(), cursors = {},
  createTransport, random, acceptJobs = () => true
} = {}) {
  const now = clock();
  let errors = config.errorCode ?? null;
  let announced = 0;
  let reminded = 0;
  let processed = 0;
  await heartbeat(client, workerId, config.mode, errors ? 'DEGRADED' : 'RUNNING', now, errors);
  try {
    const pending = await client.announcement.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      select: { id: true }, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], take: 5 });
    for (const row of pending) {
      if (!acceptJobs()) break;
      if (await publishScheduled(client, row.id, clock())) announced += 1;
    }
  } catch {
    errors ||= 'ANNOUNCEMENT_BATCH_FAILED';
  }
  if (acceptJobs()) {
    try {
      reminded = await runReminders(client, clock(), cursors, await effectiveReminders(client));
    } catch {
      errors ||= 'REMINDER_BATCH_FAILED';
    }
  }
  if (!config.errorCode && acceptJobs()) {
    try {
      const jobs = await claimEmails(client, workerId, clock(), options.batch);
      const results = await Promise.allSettled(jobs.map((job) =>
        processEmailJob(client, job, config, options, { clock, createTransport, random })));
      processed = results.filter((entry) => entry.status === 'fulfilled' && entry.value).length;
      if (results.some((entry) => entry.status === 'rejected')) errors ||= 'EMAIL_BATCH_FAILED';
      if (results.some((entry) => entry.value?.pause)) errors ||= 'SMTP_CONFIGURATION_ERROR';
    } catch {
      errors ||= 'EMAIL_BATCH_FAILED';
    }
  }
  await heartbeat(client, workerId, config.mode, errors ? 'DEGRADED' : 'RUNNING', clock(), errors);
  return { announced, reminded, processed, errorCode: errors };
}
