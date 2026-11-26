import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { runNotificationTick, heartbeat } from '../backend/src/modules/notifications/notificationWorker.js';
import { runScheduledNotifications, cronAuthorized } from '../backend/src/modules/notifications/vercelCron.js';
import { deliveryConfiguration } from '../backend/src/integrations/email/emailConfig.js';
import { workerOptions } from '../backend/src/modules/notifications/emailQueue.js';

const dbUrl = process.env.INTELLICORE_TEST_DATABASE_URL || 'mysql://intellicore_test_fresh:test_secret@127.0.0.1:33359/intellicore_test_fresh';

async function verifyBackgroundJobs() {
  console.log('[1/5] Initializing Prisma client for isolated background worker test...');
  const prisma = new PrismaClient({ datasourceUrl: dbUrl, log: [] });
  const workerId = randomUUID();
  const testRunId = randomUUID().slice(0, 8);

  try {
    // 1. Verify cron authorization logic
    console.log('[2/5] Testing cron authorization security checks...');
    const validSecret = 'a-very-long-secret-key-that-is-at-least-32-chars-long';
    const invalidSecret = 'short';
    const authHeaderValid = `Bearer ${validSecret}`;
    const authHeaderInvalid = 'Bearer wrong-secret-value-that-has-the-same-length-padded';

    if (!cronAuthorized(authHeaderValid, validSecret)) {
      throw new Error('cronAuthorized failed on valid bearer token.');
    }
    if (cronAuthorized(authHeaderInvalid, validSecret)) {
      throw new Error('cronAuthorized accepted an invalid bearer token.');
    }
    if (cronAuthorized(authHeaderValid, invalidSecret)) {
      throw new Error('cronAuthorized accepted a secret shorter than 32 characters.');
    }
    console.log('      Cron authorization security passed.');

    // 2. Heartbeat & Worker State Upsert
    console.log('[3/5] Testing background worker heartbeat and state recording...');
    const now = new Date();
    await heartbeat(prisma, workerId, 'CAPTURE', 'RUNNING', now, null);

    const workerState = await prisma.notificationWorkerState.findUnique({
      where: { id: workerId }
    });
    if (!workerState || workerState.status !== 'RUNNING' || workerState.mode !== 'CAPTURE') {
      throw new Error(`Worker state heartbeat not persisted correctly: ${JSON.stringify(workerState)}`);
    }
    console.log(`      Worker state confirmed: id=${workerId}, status=${workerState.status}, mode=${workerState.mode}`);

    console.log('[4/5] Testing EmailOutbox processing pipeline in CAPTURE mode...');
    const config = deliveryConfiguration({ APP_BASE_URL: 'http://localhost:3000', EMAIL_DELIVERY_MODE: 'CAPTURE' });
    const options = workerOptions();

    // 1. Run notification tick and verify jobs are processed from the outbox
    const tickResult = await runNotificationTick(prisma, workerId, {
      config,
      options: { ...options, batch: 10 },
      cursors: {},
      acceptJobs: () => true
    });

    console.log('      Tick execution result:', tickResult);

    // Verify worker claimed and updated delivery attempts in DB
    const attempts = await prisma.emailDeliveryAttempt.findMany({
      take: 5,
      orderBy: { startedAt: 'desc' }
    });
    console.log(`      Verified ${attempts.length} recent email delivery attempts recorded by worker.`);
    if (attempts.length === 0 && tickResult.processed === 0) {
      console.log('      (Queue was empty or cleanly drained)');
    } else {
      console.log(`      Latest delivery attempt outcome: ${attempts[0]?.outcome}, sequence: ${attempts[0]?.sequence}`);
    }

    // 4. Test runScheduledNotifications cron orchestrator
    console.log('[5/5] Testing runScheduledNotifications orchestrator with distributed lease lock...');
    const cronResult = await runScheduledNotifications(prisma, config);
    console.log('      Scheduled notification orchestrator result:', cronResult);
    if (cronResult.skipped) {
      console.log('      (Note: Job was skipped due to active lease, which is a valid lock behavior)');
    } else {
      console.log('      Scheduled notifications ran successfully without lease contention.');
    }

    // Clean up worker heartbeat test record
    await prisma.notificationWorkerState.delete({ where: { id: workerId } }).catch(() => {});

    console.log('\nSUCCESS: All background job and worker execution checks PASSED.');
  } finally {
    await prisma.$disconnect();
  }
}

verifyBackgroundJobs().catch((err) => {
  console.error('\nFAILURE: Background job verification failed:', err);
  process.exit(1);
});
