import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import '../config/env.js';
import logger from '../config/logger.js';
import { deliveryConfiguration } from '../integrations/email/emailConfig.js';
import { heartbeat, runNotificationTick } from '../modules/notifications/notificationWorker.js';
import { workerOptions } from '../modules/notifications/emailQueue.js';
import { workerDatabaseUrl } from '../modules/notifications/workerDatabase.js';

async function main() {
  const client = new PrismaClient({ datasourceUrl: workerDatabaseUrl(), log: [] });
  const workerId = randomUUID();
  const options = workerOptions();
  const config = deliveryConfiguration();
  const abort = new AbortController();
  const cursors = {};
  let pauseUntil = 0;
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => abort.abort());
  logger.info({ mode: config.mode }, 'Notification worker started.');
  try {
    while (!abort.signal.aborted) {
      try {
        const paused = pauseUntil > Date.now();
        const polled = await runNotificationTick(client, workerId, {
          config: paused ? { mode: config.mode, errorCode: 'SMTP_CONFIGURATION_ERROR' } : config,
          options, cursors, acceptJobs: () => !abort.signal.aborted
        });
        if (!paused && polled.errorCode === 'SMTP_CONFIGURATION_ERROR') pauseUntil = Date.now() + 5 * 60000;
      } catch {
        logger.warn({ code: 'WORKER_STORAGE_UNAVAILABLE' }, 'Notification worker will retry its database connection.');
      }
      try { await setTimeout(options.intervalMs, undefined, { signal: abort.signal }); }
      catch (error) { if (error.name !== 'AbortError') throw error; }
    }
  } finally {
    await heartbeat(client, workerId, config.mode, 'STOPPED', new Date()).catch(() => {});
    await client.$disconnect();
  }
}

main().catch(() => {
  logger.error({ code: 'WORKER_STARTUP_FAILED' }, 'Notification worker could not start. Check its dedicated database configuration.');
  process.exitCode = 1;
});
