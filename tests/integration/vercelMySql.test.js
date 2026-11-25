import { describe, expect, it, vi } from 'vitest';
import prisma from '../../backend/src/config/database.js';
import { runScheduledNotifications } from '../../backend/src/modules/notifications/vercelCron.js';
import { hasIsolatedDatabase } from './testDatabase.js';

describe.skipIf(!hasIsolatedDatabase())('Vercel Cron against isolated MySQL', () => {
  it('acquires one durable lease, resumes cursors across calls, and can retry a failed tick', async () => {
    const clock = () => new Date('2040-01-01T00:00:00Z');
    const cfg = { mode: 'CAPTURE' };
    let entered;
    let release;
    const started = new Promise((resolve) => { entered = resolve; });
    const blocked = new Promise((resolve) => { release = resolve; });
    const tick = vi.fn(async (_db, _id, { cursors }) => {
      cursors.tasks = 'fixture-next';
      entered();
      await blocked;
      return { errorCode: null };
    });
    const work = runScheduledNotifications(prisma, cfg, { tick, clock });
    await started;
    try {
      expect(await runScheduledNotifications(prisma, cfg, { tick, clock })).toEqual({ skipped: true });
      expect(tick).toHaveBeenCalledTimes(1);
    } finally { release(); }
    expect(await work).toEqual({ skipped: false, errorCode: null });
    const failing = vi.fn(async (_db, _id, { cursors }) => {
      expect(cursors).toEqual({ tasks: 'fixture-next' });
      throw new Error('Synthetic failure');
    });
    await expect(runScheduledNotifications(prisma, cfg, { tick: failing, clock })).rejects.toThrow('Synthetic failure');
    const retry = vi.fn((_db, _id, { cursors }) => {
      expect(cursors).toEqual({ tasks: 'fixture-next' });
      return { errorCode: null };
    });
    expect(await runScheduledNotifications(prisma, cfg, { tick: retry, clock })).toEqual({ skipped: false, errorCode: null });
  });
});
