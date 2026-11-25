import { randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import logger from '../../config/logger.js';
import { deliveryConfiguration } from '../../integrations/email/emailConfig.js';
import { runNotificationTick } from './notificationWorker.js';
import { workerDatabaseUrl } from './workerDatabase.js';

const workerId = '81d2deaa-77c3-4c5c-9903-c1df9a9c4705';
const key = 'vercel-notifications';
let client;

export function cronAuthorized(header, secret) {
  if (typeof header !== 'string' || !secret || secret.length < 32) return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from('Bearer ' + secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function runScheduledNotifications(db, config, {
  tick = runNotificationTick, clock = () => new Date()
} = {}) {
  const now = clock();
  const token = randomUUID();
  const table = db.notificationCronState;
  await table.createMany({ data: [{ key, cursors: {} }], skipDuplicates: true });
  const changed = await table.updateMany({ where: { key, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { leaseToken: token, leaseUntil: new Date(+now + 90000) } });
  if (!changed.count) return { skipped: true };
  let cursors;
  let outcome;
  try {
    const row = await table.findUniqueOrThrow({ where: { key } });
    cursors = { ...row.cursors };
    outcome = await tick(db, workerId, { config, clock, cursors, acceptJobs: () => +clock() - +now < 45000 });
    return { skipped: false, ...outcome };
  } finally {
    await table.updateMany({ where: { key, leaseToken: token },
      data: { leaseUntil: null, leaseToken: null, ...(outcome && { cursors: JSON.parse(JSON.stringify(cursors)) }) } });
  }
}

function captureConfiguration(source) {
  const mode = source.EMAIL_DELIVERY_MODE ?? 'CAPTURE';
  if (!['CAPTURE', 'DISABLED'].includes(mode) || !source.APP_BASE_URL) return null;
  return deliveryConfiguration({ APP_BASE_URL: source.APP_BASE_URL, EMAIL_DELIVERY_MODE: mode });
}

export async function vercelNotificationCron(req, res) {
  const source = process.env;
  res.set('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' || source.VERCEL !== '1' || source.NOTIFICATION_CRON_ENABLED !== 'true') return res.sendStatus(404);
  if (!cronAuthorized(req.get('authorization'), source.CRON_SECRET)) return res.sendStatus(401);
  const config = captureConfiguration(source);
  if (!config || config.errorCode) return res.status(503).json({ status: 'WORKER_CONFIGURATION_INVALID' });

  try {
    client ??= new PrismaClient({ datasourceUrl: workerDatabaseUrl(source), log: [] });
    const result = await runScheduledNotifications(client, config);
    if (result.errorCode) {
      logger.warn({ code: result.errorCode }, 'Scheduled notification worker finished with errors.');
      return res.status(503).json({ status: 'WORKER_DEGRADED' });
    }
    return res.json({ status: result.skipped ? 'ALREADY_RUNNING' : 'OK' });
  } catch {
    logger.warn({ code: 'NOTIFICATION_CRON_FAILED' }, 'Scheduled notification worker failed.');
    return res.status(503).json({ status: 'WORKER_UNAVAILABLE' });
  }
}
