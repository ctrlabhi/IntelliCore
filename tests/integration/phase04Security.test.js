import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import { founderFixture } from './testDatabase.js';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() }, department: { count: vi.fn(), findMany: vi.fn() }, $transaction: vi.fn()
}));
vi.mock('../../backend/src/config/database.js', () => ({
  getPrismaClient: () => db,
  checkDatabaseConnection: () => Promise.resolve(false)
}));

const targetId = randomUUID();
const founderPermissions = [
  'staff:create', 'roles:assign', 'roles:manage_permissions', 'departments:create', 'departments:update',
  'departments:assign_staff', 'applications:read_all', 'applications:review', 'internships:manage',
  'internships:approve_completion'
];

function identity(roleCode, { status = 'ACTIVE', verified = true, primary = false } = {}) {
  const uid = primary ? founderFixture.uid : 'phase04-fake-user';
  const email = primary ? founderFixture.email : 'actor@example.test';
  vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
    uid, email, email_verified: verified, aud: 'intellicore-dev', firebase: { sign_in_provider: 'password' }
  });
  db.user.findUnique.mockResolvedValue({
    id: randomUUID(), firebaseUid: uid, email, emailVerified: verified, status,
    userRoles: [{ role: { code: roleCode, rolePermissions: founderPermissions.map((code) => ({ permission: { code } })) } }]
  });
}

describe('Phase 04 route security with a mocked database and Firebase verifier', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it.each(['CO_FOUNDER', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'OPERATIONS_EXECUTIVE', 'TEAM_LEADER', 'INTERN'])(
    'keeps protected administrative operations out of the %s role even with stored permissions', async (role) => {
      identity(role);
      const responses = await Promise.all([
        request(app).post('/api/v1/staff').send({}),
        request(app).put(`/api/v1/users/${targetId}/roles`).send({ roles: ['TEAM_LEADER'] }),
        request(app).put('/api/v1/roles/ADMIN/permissions').send({ permissions: ['roles:assign'] }),
        request(app).put(`/api/v1/departments/${targetId}/staff`).send({})
      ].map((call) => call.set('Authorization', 'Bearer test.actor.token')));
      expect(responses.map(({ status }) => status)).toEqual([403, 403, 403, 403]);
      expect(db.$transaction).not.toHaveBeenCalled();
    }
  );

  it('requires the configured primary identity even for a stored Founder role', async () => {
    identity('FOUNDER');
    const response = await request(app).post('/api/v1/departments').set('Authorization', 'Bearer test.founder.token').send({});
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FOUNDER_REQUIRED');
  });

  it('keeps Founder-only grants out of editable role mappings', async () => {
    identity('FOUNDER', { primary: true });
    const remove = vi.fn();
    db.$transaction.mockImplementation((work) => work({
      role: { findFirst: vi.fn().mockResolvedValue({ id: targetId, code: 'ADMIN', rolePermissions: [] }) },
      permission: { findMany: vi.fn().mockResolvedValue([{ id: 'protected', code: 'staff:create' }]) },
      rolePermission: { deleteMany: remove }
    }));
    const response = await request(app).put('/api/v1/roles/ADMIN/permissions')
      .set('Authorization', 'Bearer test.founder.token').send({ permissions: ['staff:create'] });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FOUNDER_PERMISSION_PROTECTED');
    expect(remove).not.toHaveBeenCalled();
  });

  it('only exposes the active department catalog to verified pending applicants', async () => {
    identity('INTERN', { status: 'PENDING' });
    db.department.count.mockResolvedValue(1);
    db.department.findMany.mockResolvedValue([{ id: targetId, name: 'Test department' }]);
    const catalog = await request(app).get('/api/v1/departments?includeInactive=true').set('Authorization', 'Bearer test.pending.token');
    const overview = await request(app).get('/api/v1/internship-applications').set('Authorization', 'Bearer test.pending.token');
    expect(catalog.status).toBe(200);
    expect(db.department.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true }, select: expect.not.objectContaining({ createdAt: true })
    }));
    expect(overview.status).toBe(403);
    expect(overview.body.error.code).toBe('ACCOUNT_STATUS_RESTRICTED');
  });

  it('requires verified email and rejects applicant-supplied review state', async () => {
    identity('INTERN', { status: 'PENDING', verified: false });
    const denied = await request(app).get('/api/v1/internship-applications/me').set('Authorization', 'Bearer test.pending.token');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    identity('INTERN', { status: 'PENDING' });
    const invalid = await request(app).post('/api/v1/internship-applications').set('Authorization', 'Bearer test.pending.token').send({
      departmentId: targetId, requestedStartDate: '2034-01-31', durationMonths: 1,
      qualification: 'Qualification', institution: 'Institution', applicationStatus: 'APPROVED'
    });
    expect(invalid.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does not turn a read-only HR Executive into a reviewer through an editable grant', async () => {
    identity('HR_EXECUTIVE');
    const response = await request(app).post(`/api/v1/internship-applications/${targetId}/approve`)
      .set('Authorization', 'Bearer test.reader.token').send({});
    expect(response.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
