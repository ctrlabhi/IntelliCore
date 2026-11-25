import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import env from '../../backend/src/config/env.js';

// Mock DB
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  role: { findUnique: vi.fn(), findMany: vi.fn() },
  department: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  staffProfile: { findUnique: vi.fn(), create: vi.fn() },
  internship: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  internshipApplication: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  attendance: { findUnique: vi.fn(), findMany: vi.fn() },
  dailyWorkReport: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  leaveRequest: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  certificateDispatch: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  emailOutbox: { create: vi.fn(), findMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn((fn) => (typeof fn === 'function' ? fn(db) : Promise.all(fn)))
}));

vi.mock('../../backend/src/config/database.js', () => ({
  getPrismaClient: () => db,
  checkDatabaseConnection: () => Promise.resolve(true)
}));

const PRIMARY_FOUNDER_UID = env.FOUNDER_FIREBASE_UID;
const PRIMARY_FOUNDER_EMAIL = env.FOUNDER_EMAIL;

function mockAuth(roleCode, { isPrimaryFounder = false, status = 'ACTIVE', deptId = 'dept-web' } = {}) {
  const uid = isPrimaryFounder ? PRIMARY_FOUNDER_UID : `mock-uid-${roleCode.toLowerCase()}`;
  const email = isPrimaryFounder ? PRIMARY_FOUNDER_EMAIL : `${roleCode.toLowerCase()}@intellicore.test`;
  const userId = `user-id-${roleCode.toLowerCase()}`;

  vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
    uid,
    email,
    email_verified: true,
    aud: 'intellicore-dev',
    firebase: { sign_in_provider: 'password' }
  });

  const permissionsByRole = {
    FOUNDER: ['*'],
    CO_FOUNDER: ['departments:read', 'staff:read', 'internships:read', 'analytics:read'],
    ADMIN: ['users:read', 'users:update', 'roles:read', 'departments:read', 'analytics:read'],
    HR_MANAGER: ['applications:read_all', 'applications:review', 'internships:read', 'internships:manage', 'leave:review', 'attendance:read'],
    HR_EXECUTIVE: ['applications:read_all', 'internships:read', 'leave:read', 'attendance:read'],
    OPERATIONS_EXECUTIVE: ['attendance:read', 'departments:read', 'analytics:read'],
    TEAM_LEADER: ['internships:read', 'tasks:manage', 'reports:review', 'meetings:manage'],
    INTERN: ['tasks:submit', 'reports:create', 'attendance:checkin', 'leave:request']
  };

  const rolePerms = (permissionsByRole[roleCode] || []).map((code) => ({
    permission: { code }
  }));

  db.user.findUnique.mockResolvedValue({
    id: userId,
    firebaseUid: uid,
    email,
    emailVerified: true,
    status,
    userRoles: [{ role: { code: roleCode, rolePermissions: rolePerms } }],
    userDepartments: [{ departmentId: deptId, assignedRole: roleCode }]
  });

  return { userId, uid, email, token: `Bearer token-${roleCode}` };
}

describe('IntelliCore V2.0 Multi-Role QA Acceptance & Invariants Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. All 8 Roles Matrix Verification
  // ---------------------------------------------------------------------------
  describe('System Roles Matrix Verification', () => {
    const allRoles = [
      'FOUNDER',
      'CO_FOUNDER',
      'ADMIN',
      'HR_MANAGER',
      'HR_EXECUTIVE',
      'OPERATIONS_EXECUTIVE',
      'TEAM_LEADER',
      'INTERN'
    ];

    it.each(allRoles)('properly authenticates and resolves role: %s', async (roleCode) => {
      const auth = mockAuth(roleCode, { isPrimaryFounder: roleCode === 'FOUNDER' });
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', auth.token);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(auth.email);
      expect(res.body.data.roles).toContain(roleCode);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Founder Exclusive Authority
  // ---------------------------------------------------------------------------
  describe('Founder Exclusivity & RBAC Guards', () => {
    it('allows Primary Founder with staff:create to pass founder and permission checks', async () => {
      const auth = mockAuth('FOUNDER', { isPrimaryFounder: true });
      db.user.findUnique
        .mockResolvedValueOnce({
          id: auth.userId,
          firebaseUid: auth.uid,
          email: auth.email,
          emailVerified: true,
          status: 'ACTIVE',
          userRoles: [{ role: { code: 'FOUNDER', rolePermissions: [{ permission: { code: 'staff:create' } }] } }]
        })
        .mockResolvedValueOnce({
          id: 'target-user-01',
          email: 'target@intellicore.test',
          status: 'ACTIVE'
        });

      db.staffProfile.create.mockResolvedValue({
        id: 'staff-01',
        userId: 'target-user-01',
        staffCode: 'STAFF-001',
        designation: 'Lead Engineer',
        joiningDate: new Date('2026-01-01')
      });

      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', auth.token)
        .send({
          userId: 'target-user-01',
          designation: 'Lead Engineer',
          joiningDate: '2026-01-01',
          roleCode: 'TEAM_LEADER'
        });

      // Should not be forbidden with FOUNDER_REQUIRED or FORBIDDEN
      expect(res.status).not.toBe(403);
    });

    it.each(['CO_FOUNDER', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'OPERATIONS_EXECUTIVE', 'TEAM_LEADER', 'INTERN'])(
      'strictly blocks %s from staff provisioning (returns 403)',
      async (roleCode) => {
        const auth = mockAuth(roleCode);
        const res = await request(app)
          .post('/api/v1/staff')
          .set('Authorization', auth.token)
          .send({ userId: 'some-user', designation: 'Test' });

        expect(res.status).toBe(403);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Negative Invariants Verification
  // ---------------------------------------------------------------------------
  describe('Negative Invariants & Security Boundaries', () => {
    it('strictly forbids certificate PDF generation/download routes (returns 404)', async () => {
      const auth = mockAuth('FOUNDER', { isPrimaryFounder: true });
      const paths = [
        '/api/v1/certificates/generate',
        '/api/v1/certificates/download',
        '/api/v1/certificates/qr-code',
        '/certificates/download.pdf',
        '/api/v1/internships/int-101/certificate/pdf'
      ];

      for (const p of paths) {
        const res = await request(app).get(p).set('Authorization', auth.token);
        expect(res.status).toBe(404);
      }
    });

    it('confirms manual certificate dispatch declaration creates zero EmailOutbox jobs', async () => {
      const auth = mockAuth('FOUNDER', { isPrimaryFounder: true });
      const targetInternshipId = 'int-qa-completed-001';

      db.internship.findUnique.mockResolvedValue({
        id: targetInternshipId,
        internshipStatus: 'COMPLETED',
        userId: 'intern-01'
      });

      db.certificateDispatch.findMany.mockResolvedValue([]);
      db.certificateDispatch.create.mockResolvedValue({
        id: 'dispatch-01',
        internshipId: targetInternshipId,
        sequence: 1,
        status: 'SENT',
        declaredSentAt: new Date(),
        actorId: auth.userId
      });

      // Manual dispatch declaration endpoint
      const res = await request(app)
        .post(`/api/v1/internships/${targetInternshipId}/certificate-dispatch`)
        .set('Authorization', auth.token)
        .send({
          requestKey: 'req-qa-001',
          status: 'SENT',
          note: 'Sent manually via verified Google Workspace email outside platform.'
        });

      // Verify that NO emailOutbox record was created
      expect(db.emailOutbox.create).not.toHaveBeenCalled();
    });

    it('confirms production Firebase intellicore-229 is strictly quarantined', () => {
      expect(env.FIREBASE_PROJECT_ID).toBe('intellicore-dev');
      expect(env.FIREBASE_PROJECT_ID).not.toBe('intellicore-229');
    });

    it('strictly blocks direct HTTP access to sensitive files and directories with 403', async () => {
      const sensitiveFiles = [
        '/.env',
        '/.git/config',
        '/secrets/firebase-admin-dev.json',
        '/prisma/schema.prisma',
        '/package.json',
        '/docker-compose.yml'
      ];

      for (const filePath of sensitiveFiles) {
        const res = await request(app).get(filePath);
        expect(res.status).toBe(403);
        expect(res.text).toContain('Access Denied');
      }
    });
  });
});
