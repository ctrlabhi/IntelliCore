import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import auditService from '../../backend/src/modules/audit/auditService.js';
import { getPrismaClient } from '../../backend/src/config/database.js';

const prisma = getPrismaClient();

import { founderFixture, hasIsolatedDatabase } from './testDatabase.js';

const { uid: founderUid, email: founderEmail } = founderFixture;

describe.skipIf(!hasIsolatedDatabase())('Integration: Audit Logs Module (/api/v1/audit-logs)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/v1/audit-logs returns paginated security and administrative logs', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .get('/api/v1/audit-logs?page=1&limit=10')
      .set('Authorization', 'Bearer valid.founder.token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.logs).toBeInstanceOf(Array);
    expect(res.body.data.pagination).toBeDefined();
    expect(res.body.data.pagination.page).toBe(1);
  });

  it('sanitizes and redacts sensitive data before persisting audit log', async () => {
    const founder = await prisma.user.findUnique({ where: { email: founderEmail } });

    const log = await auditService.createAuditLog(prisma, {
      actorUserId: founder.id,
      action: 'SECURITY_TEST_ACTION',
      resourceType: 'TEST_RESOURCE',
      resourceId: 'res-test-99',
      beforeState: { password: 'SuperSecretPassword', token: 'jwt.token.secret', normalField: 'Safe' },
      afterState: { credential: 'private_key_data', normalField: 'UpdatedSafe' },
      result: 'SUCCESS'
    });

    expect(log).toBeDefined();
    expect(log.sanitizedBefore).toContain('[REDACTED]');
    expect(log.sanitizedBefore).not.toContain('SuperSecretPassword');
    expect(log.sanitizedBefore).toContain('Safe');
    expect(log.sanitizedAfter).toContain('[REDACTED]');
    expect(log.sanitizedAfter).not.toContain('private_key_data');

    // Clean up test audit log
    await prisma.auditLog.delete({ where: { id: log.id } }).catch(() => {});
  });
});
