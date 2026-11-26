import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { vercelDatabaseUrl } from '../../backend/src/config/vercelDatabase.js';
import { VercelBlobStorage } from '../../backend/src/integrations/storage/vercelBlobStorage.js';
import { cronAuthorized } from '../../backend/src/modules/notifications/vercelCron.js';
import { workerDatabaseUrl } from '../../backend/src/modules/notifications/workerDatabase.js';

const key = '11111111-1111-4111-8111-111111111111';
const token = 'test-fixture';

describe('Vercel runtime integration', () => {
  it('exports the same Express application routing and security on the Vercel entry point', async () => {
    const home = await request(app).get('/');
    const frontendRedirect = await request(app).get('/frontend');
    const openRedirectAttempt1 = await request(app).get('/frontend//evil.com');
    const openRedirectAttempt2 = await request(app).get('/frontend/https://evil.com');
    const notes = await request(app).get('/pages/notes.html');
    const dashboard = await request(app).get('/dashboards/intern');
    expect(home.status).toBe(200);
    expect(frontendRedirect.status).toBe(301);
    expect(frontendRedirect.headers.location).toBe('/');
    expect(openRedirectAttempt1.status).toBe(301);
    expect(openRedirectAttempt1.headers.location).toBe('/');
    expect(openRedirectAttempt2.status).toBe(301);
    expect(openRedirectAttempt2.headers.location).toBe('/');
    expect(notes.text).toContain('IntelliCore Notes AI');
    expect(dashboard.status).toBe(200);
    expect(home.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect((await request(app).get('/api/internal/notification-tick')).status).toBe(404);
  });

  it('rejects privileged or localhost MySQL endpoints and caps Prisma connection pools', () => {
    const url = new URL(vercelDatabaseUrl('mysql://app:fixture@db.example.test/fixture?connection_limit=20&sslaccept=accept_invalid_certs'));
    expect(url.searchParams.get('connection_limit')).toBe('2');
    expect(url.searchParams.get('sslaccept')).toBe('strict');
    expect(() => vercelDatabaseUrl('mysql://root:fixture@db.example.test/fixture')).toThrow();
    expect(() => vercelDatabaseUrl('mysql://intellicore_worker:fixture@db.example.test/fixture')).toThrow();
    expect(() => vercelDatabaseUrl('mysql://intellicore_migration:fixture@db.example.test/fixture')).toThrow();
    expect(() => vercelDatabaseUrl('mysql://app:fixture@localhost/fixture')).toThrow();
  });

  it('keeps worker and runtime credentials separate and on the same schema', () => {
    const source = { VERCEL: '1', DATABASE_URL: 'mysql://app:fixture@db.example.test/fixture',
      NOTIFICATION_DATABASE_URL: 'mysql://intellicore_worker:fixture@db.example.test/fixture' };
    expect(new URL(workerDatabaseUrl(source)).searchParams.get('sslaccept')).toBe('strict');
    expect(() => workerDatabaseUrl({ ...source, DATABASE_URL: source.NOTIFICATION_DATABASE_URL })).toThrow();
    expect(() => workerDatabaseUrl({ ...source, NOTIFICATION_DATABASE_URL: source.NOTIFICATION_DATABASE_URL + '_other' })).toThrow();
    expect(() => workerDatabaseUrl({ ...source, NOTIFICATION_DATABASE_URL: source.NOTIFICATION_DATABASE_URL.replace('db.example.test', 'separate.example.test') })).toThrow();
  });

  it('writes immutable private objects and streams only the requested key', async () => {
    const bytes = Buffer.from('private attachment fixture');
    const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    const client = { put: vi.fn(), get: vi.fn().mockResolvedValue({ statusCode: 200, stream }), del: vi.fn() };
    const storage = new VercelBlobStorage({ token, client });
    await storage.savePrivate(key, bytes);
    expect(client.put).toHaveBeenCalledWith('phase06/' + key, bytes,
      expect.objectContaining({ token, access: 'private', allowOverwrite: false, addRandomSuffix: false }));
    const result = await storage.openPrivate(key);
    const chunks = [];
    for await (const part of result) chunks.push(part);
    expect(Buffer.concat(chunks)).toEqual(bytes);
    await storage.removePrivate(key);
    expect(client.del).toHaveBeenCalledWith('phase06/' + key, { token });
    await expect(storage.openPrivate('https://unrelated.example/')).rejects.toMatchObject({ code: 'INVALID_STORAGE_KEY' });
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('translates missing storage and provider failure to safe errors', async () => {
    const missing = new VercelBlobStorage({ token, client: { get: vi.fn().mockResolvedValue(null) } });
    await expect(missing.openPrivate(key)).rejects.toMatchObject({ statusCode: 404 });
    const denied = new VercelBlobStorage({ token, client: { put: vi.fn().mockRejectedValue(new Error('secret from provider')) } });
    await expect(denied.savePrivate(key, Buffer.from('private'))).rejects.toMatchObject({
      message: 'Private storage is temporarily unavailable.'
    });
    await expect(new VercelBlobStorage({ token: '' }).openPrivate(key)).rejects.toMatchObject({ statusCode: 503 });
  });

  it('requires an exact secret and blocks the Cron route before creating a worker connection', async () => {
    const secret = 'fixture-'.repeat(5);
    expect(cronAuthorized('Bearer ' + secret, secret)).toBe(true);
    expect(cronAuthorized('Bearer ' + secret + 'x', secret)).toBe(false);
    expect(cronAuthorized('Bearer short', 'short')).toBe(false);
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NOTIFICATION_CRON_ENABLED', 'true');
    vi.stubEnv('CRON_SECRET', secret);
    vi.stubEnv('EMAIL_DELIVERY_MODE', 'SMTP');
    vi.stubEnv('APP_BASE_URL', 'https://app.example.test');
    try {
      expect((await request(app).get('/api/internal/notification-tick')).status).toBe(401);
      expect((await request(app).head('/api/internal/notification-tick').set('Authorization', 'Bearer ' + secret)).status).toBe(404);
      expect((await request(app).get('/api/internal/notification-tick').set('Authorization', 'Bearer ' + secret)).status).toBe(503);
    } finally { vi.unstubAllEnvs(); }
  });
});
