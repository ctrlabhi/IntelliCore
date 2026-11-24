import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import { getPrismaClient } from '../../backend/src/config/database.js';

const prisma = getPrismaClient();

import { founderFixture, hasIsolatedDatabase } from './testDatabase.js';

const { uid: founderUid, email: founderEmail } = founderFixture;

const testInternUid = 'test_user_mgmt_intern_uid_101';
const testInternEmail = 'intern.user.mgmt@intellicore.dev';

let testInternUser = null;
let founderUser = null;

describe.skipIf(!hasIsolatedDatabase())('Integration: User Management Endpoints (/api/v1/users)', () => {
  beforeAll(async () => {
    // Ensure founder user exists in DB
    founderUser = await prisma.user.findUnique({
      where: { email: founderEmail },
      include: { userRoles: { include: { role: true } } }
    });

    // Create a test intern candidate in DB
    const internRole = await prisma.role.findUnique({ where: { code: 'INTERN' } });
    testInternUser = await prisma.user.upsert({
      where: { firebaseUid: testInternUid },
      update: { status: 'PENDING' },
      create: {
        firebaseUid: testInternUid,
        email: testInternEmail,
        status: 'PENDING',
        profile: {
          create: {
            fullName: 'User Management Intern Test'
          }
        },
        userRoles: {
          create: {
            roleId: internRole.id
          }
        }
      }
    });
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [testInternEmail, 'temporary.candidate@intellicore.dev']
          }
        }
      });
    } catch (_) {}
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/v1/users returns paginated user directory when authenticated with users:read', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .get('/api/v1/users?page=1&limit=10&role=FOUNDER')
      .set('Authorization', 'Bearer valid.founder.token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.users).toBeInstanceOf(Array);
    expect(res.body.data.pagination).toBeDefined();
    expect(res.body.data.pagination.page).toBe(1);

    const founderInList = res.body.data.users.find((u) => u.email === founderEmail);
    expect(founderInList).toBeDefined();
    expect(founderInList.roles.some((r) => r.code === 'FOUNDER')).toBe(true);
  });

  it('GET /api/v1/users/:id returns user details and roles', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .get(`/api/v1/users/${testInternUser.id}`)
      .set('Authorization', 'Bearer valid.founder.token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(testInternUser.id);
    expect(res.body.data.email).toBe(testInternEmail);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('PATCH /api/v1/users/:id/status cannot bypass the internship approval workflow', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .patch(`/api/v1/users/${testInternUser.id}/status`)
      .set('Authorization', 'Bearer valid.founder.token')
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPROVAL_REQUIRED');
    const updated = await prisma.user.findUnique({ where: { id: testInternUser.id } });
    expect(updated.status).toBe('PENDING');
  });

  it('PATCH /api/v1/users/:id/status strictly prohibits suspending or deactivating Founder account', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .patch(`/api/v1/users/${founderUser.id}/status`)
      .set('Authorization', 'Bearer valid.founder.token')
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CANNOT_MODIFY_FOUNDER_STATUS');

    // Verify Founder remains ACTIVE in DB
    const checkFounder = await prisma.user.findUnique({ where: { id: founderUser.id } });
    expect(checkFounder.status).toBe('ACTIVE');
  });

  it('PATCH /api/v1/users/:id/status prohibits self-deactivation', async () => {
    // Create an active admin user for self-deactivation test
    const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
    const tempAdmin = await prisma.user.upsert({
      where: { firebaseUid: 'temp_admin_uid_self_deact' },
      update: { status: 'ACTIVE' },
      create: {
        firebaseUid: 'temp_admin_uid_self_deact',
        email: 'temporary.admin@intellicore.dev',
        status: 'ACTIVE',
        userRoles: {
          create: {
            roleId: adminRole.id
          }
        }
      }
    });

    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: 'temp_admin_uid_self_deact',
      email: 'temporary.admin@intellicore.dev',
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .patch(`/api/v1/users/${tempAdmin.id}/status`)
      .set('Authorization', 'Bearer temp.admin.token')
      .send({ status: 'SUSPENDED' });

    // Since tempAdmin doesn't have users:update_status or if it did, it should fail with 400 or 403
    expect([400, 403]).toContain(res.status);

    // Cleanup
    await prisma.user.delete({ where: { id: tempAdmin.id } }).catch(() => {});
  });
});
