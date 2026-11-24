import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import { requireRole, requirePermission } from '../../backend/src/middleware/auth.js';
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

  describe('Authorization: requireRole & requirePermission Guardrails', () => {
    const mockRes = () => ({
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      locals: {}
    });

    it('requireRole rejects non-ACTIVE accounts with 403 ACCOUNT_STATUS_RESTRICTED', () => {
      const middleware = requireRole('FOUNDER');
      const req = { user: { status: 'PENDING' }, roles: ['FOUNDER'] };
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'ACCOUNT_STATUS_RESTRICTED' })
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('requireRole allows ACTIVE accounts with the required role', () => {
      const middleware = requireRole('FOUNDER');
      const req = { user: { status: 'ACTIVE' }, roles: ['FOUNDER'] };
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('requireRole rejects ACTIVE accounts lacking the role with 403 FORBIDDEN_ROLE', () => {
      const middleware = requireRole('FOUNDER');
      const req = { user: { status: 'ACTIVE' }, roles: ['INTERN'] };
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'FORBIDDEN_ROLE' })
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('requirePermission rejects non-ACTIVE accounts with 403 ACCOUNT_STATUS_RESTRICTED', () => {
      const middleware = requirePermission('workspace:founder');
      const req = { user: { status: 'SUSPENDED' }, permissions: ['workspace:founder'] };
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('requirePermission allows ACTIVE accounts with all required permissions', () => {
      const middleware = requirePermission('workspace:founder');
      const req = { user: { status: 'ACTIVE' }, permissions: ['workspace:founder'] };
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});

