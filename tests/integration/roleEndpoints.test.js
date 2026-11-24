import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import { getPrismaClient } from '../../backend/src/config/database.js';

const prisma = getPrismaClient();

const founderUid = 'svNt0UTSz9N59EzlaTWR7jsCu5c2';
const founderEmail = 'ctrlabhishek@gmail.com';

const testRoleTargetUid = 'role_target_user_uid_103';
const testRoleTargetEmail = 'role.target@intellicore.dev';

let targetUser = null;

describe('Integration: Role & Permission Management (/api/v1/roles, /api/v1/permissions)', () => {
  beforeAll(async () => {
    const internRole = await prisma.role.findUnique({ where: { code: 'INTERN' } });
    targetUser = await prisma.user.upsert({
      where: { firebaseUid: testRoleTargetUid },
      update: { status: 'ACTIVE' },
      create: {
        firebaseUid: testRoleTargetUid,
        email: testRoleTargetEmail,
        status: 'ACTIVE',
        profile: {
          create: {
            fullName: 'Role Target Test'
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
      if (targetUser) {
        await prisma.user.deleteMany({ where: { id: targetUser.id } });
      }
    } catch (_) {}
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/v1/roles returns list of all system roles', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .get('/api/v1/roles')
      .set('Authorization', 'Bearer valid.founder.token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(8);

    const founderRole = res.body.data.find((r) => r.code === 'FOUNDER');
    expect(founderRole).toBeDefined();
    expect(founderRole.isSystemRole).toBe(true);
  });

  it('GET /api/v1/permissions returns complete permissions catalog', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .get('/api/v1/permissions')
      .set('Authorization', 'Bearer valid.founder.token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(20);
    expect(res.body.data.some((p) => p.code === 'audit_logs:read')).toBe(true);
  });

  it('PUT /api/v1/users/:id/roles updates assigned roles', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .put(`/api/v1/users/${targetUser.id}/roles`)
      .set('Authorization', 'Bearer valid.founder.token')
      .send({ roles: ['TEAM_LEADER'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.roles.some((r) => r.code === 'TEAM_LEADER')).toBe(true);

    const check = await prisma.user.findUnique({
      where: { id: targetUser.id },
      include: { userRoles: { include: { role: true } } }
    });
    expect(check.userRoles.some((ur) => ur.role.code === 'TEAM_LEADER')).toBe(true);
  });

  it('PUT /api/v1/users/:id/roles strictly prohibits assigning FOUNDER role via HTTP API', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .put(`/api/v1/users/${targetUser.id}/roles`)
      .set('Authorization', 'Bearer valid.founder.token')
      .send({ roles: ['FOUNDER', 'ADMIN'] });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CANNOT_ASSIGN_FOUNDER_ROLE');
  });

  it('PUT /api/v1/roles/:id/permissions protects FOUNDER core permissions from alteration', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .put('/api/v1/roles/FOUNDER/permissions')
      .set('Authorization', 'Bearer valid.founder.token')
      .send({ permissions: ['auth:login'] });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('IMMUTABLE_ROLE_PERMISSIONS');
  });
});
