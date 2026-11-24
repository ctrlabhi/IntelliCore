import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import { getPrismaClient } from '../../backend/src/config/database.js';

const prisma = getPrismaClient();

describe('Integration: Authentication & Authorization Middleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects requests with missing Authorization header with 401', async () => {
    const res = await request(app).post('/api/v1/auth/bootstrap');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects requests with malformed Authorization header with 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/bootstrap')
      .set('Authorization', 'Basic invalid_credentials');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects invalid or expired tokens with 401', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockRejectedValue(new Error('Firebase token expired'));

    const res = await request(app)
      .post('/api/v1/auth/bootstrap')
      .set('Authorization', 'Bearer expired.token.value');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects tokens issued for an unauthorized Firebase project with 403', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: 'fake_uid_foreign_project',
      email: 'attacker@example.com',
      aud: 'malicious-foreign-project-id'
    });

    const res = await request(app)
      .post('/api/v1/auth/bootstrap')
      .set('Authorization', 'Bearer wrong.project.token');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('WRONG_PROJECT');
  });

  it('returns 503 when Firebase verification service errors unexpectedly', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockImplementation(() => {
      const err = new Error('Connection reset');
      err.code = 'ETIMEDOUT';
      throw err;
    });

    const res = await request(app)
      .post('/api/v1/auth/bootstrap')
      .set('Authorization', 'Bearer valid.syntax.token');
    expect(res.status).toBe(401); // Verification error maps to 401 INVALID_TOKEN
  });
});
