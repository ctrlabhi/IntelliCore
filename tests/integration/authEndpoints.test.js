import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import { getPrismaClient } from '../../backend/src/config/database.js';

const prisma = getPrismaClient();

const testUid = 'test_firebase_uid_bootstrap_101';
const testEmail = 'intern.test.unique@intellicore.dev';

describe('Integration: Authentication Endpoints & Identity Synchronization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    // Clean up test records
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [testEmail, 'collision.test@intellicore.dev']
          }
        }
      });
    } catch (_) {}
  });

  it('POST /api/v1/auth/bootstrap creates a new user with PENDING status and INTERN role', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: testUid,
      email: testEmail,
      email_verified: true,
      aud: 'intellicore-dev',
      name: 'Test Intern Candidate'
    });

    const res = await request(app)
      .post('/api/v1/auth/bootstrap')
      .set('Authorization', 'Bearer mock.jwt.token')
      .send({ fullName: 'Test Intern Candidate' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testEmail);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.roles).toContain('INTERN');
    expect(res.body.data.workspaces.intern).toBe(true);
    expect(res.body.data.workspaces.founder).toBe(false);
  });

  it('POST /api/v1/auth/bootstrap is idempotent on subsequent logins and preserves existing status', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: testUid,
      email: testEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .post('/api/v1/auth/bootstrap')
      .set('Authorization', 'Bearer mock.jwt.token');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING'); // Preserved status
    expect(res.body.data.roles).toContain('INTERN');
  });

  it('POST /api/v1/auth/bootstrap rejects duplicate email registration from a different Firebase UID with 409', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: 'different_attacker_uid_999',
      email: testEmail, // Existing email
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .post('/api/v1/auth/bootstrap')
      .set('Authorization', 'Bearer mock.jwt.token');

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('GET /api/v1/auth/me returns identity, profile and authorized workspaces', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: testUid,
      email: testEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer mock.jwt.token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testEmail);
    expect(res.body.data.profile.fullName).toBe('Test Intern Candidate');
    expect(res.body.data.roles).toContain('INTERN');
  });

  it('GET /api/v1/auth/status returns current access authorization status', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: testUid,
      email: testEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .get('/api/v1/auth/status')
      .set('Authorization', 'Bearer mock.jwt.token');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.isAccessGranted).toBe(false); // PENDING users do not have full active access
  });

  it('PATCH /api/v1/users/me/profile updates permitted profile fields', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: testUid,
      email: testEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .patch('/api/v1/users/me/profile')
      .set('Authorization', 'Bearer mock.jwt.token')
      .send({
        fullName: 'Updated Name Candidate',
        displayName: 'UpdatedNick'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('Updated Name Candidate');
    expect(res.body.data.displayName).toBe('UpdatedNick');
  });

  it('PATCH /api/v1/users/me/profile rejects unauthorized privilege escalation fields with 400', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: testUid,
      email: testEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .patch('/api/v1/users/me/profile')
      .set('Authorization', 'Bearer mock.jwt.token')
      .send({
        fullName: 'Attacker Name',
        status: 'ACTIVE', // Forbidden privileged field
        role: 'FOUNDER'   // Forbidden privileged field
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
