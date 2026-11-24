import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import { getPrismaClient } from '../../backend/src/config/database.js';

const prisma = getPrismaClient();

const founderUid = 'svNt0UTSz9N59EzlaTWR7jsCu5c2';
const founderEmail = 'ctrlabhishek@gmail.com';

const staffCandidateUid = 'staff_candidate_uid_test_102';
const staffCandidateEmail = 'staff.candidate@intellicore.dev';

let candidateUser = null;
let provisionedStaffRecord = null;

describe('Integration: Staff Management Endpoints (/api/v1/staff)', () => {
  beforeAll(async () => {
    // Create candidate user
    const internRole = await prisma.role.findUnique({ where: { code: 'INTERN' } });
    candidateUser = await prisma.user.upsert({
      where: { firebaseUid: staffCandidateUid },
      update: { status: 'PENDING' },
      create: {
        firebaseUid: staffCandidateUid,
        email: staffCandidateEmail,
        status: 'PENDING',
        profile: {
          create: {
            fullName: 'Staff Candidate Test'
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
      if (candidateUser) {
        await prisma.staffProfile.deleteMany({ where: { userId: candidateUser.id } });
        await prisma.user.deleteMany({ where: { id: candidateUser.id } });
      }
    } catch (_) {}
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /api/v1/staff provisions an existing user as staff with auto-generated code and role', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .post('/api/v1/staff')
      .set('Authorization', 'Bearer valid.founder.token')
      .send({
        userId: candidateUser.id,
        designation: 'Associate HR Specialist',
        joiningDate: '2026-11-25T00:00:00.000Z',
        roleCode: 'HR_EXECUTIVE'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.staffCode).toMatch(/^STF-\d{4}$/);
    expect(res.body.data.designation).toBe('Associate HR Specialist');
    expect(res.body.data.employmentStatus).toBe('ACTIVE');
    expect(res.body.data.role.code).toBe('HR_EXECUTIVE');

    provisionedStaffRecord = res.body.data;

    // Verify user status was activated in DB
    const checkUser = await prisma.user.findUnique({
      where: { id: candidateUser.id },
      include: { userRoles: { include: { role: true } } }
    });
    expect(checkUser.status).toBe('ACTIVE');
    expect(checkUser.userRoles.some((ur) => ur.role.code === 'HR_EXECUTIVE')).toBe(true);
    expect(checkUser.userRoles.some((ur) => ur.role.code === 'INTERN')).toBe(false);
  });

  it('POST /api/v1/staff rejects provisioning when user is already a staff member', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .post('/api/v1/staff')
      .set('Authorization', 'Bearer valid.founder.token')
      .send({
        userId: candidateUser.id,
        designation: 'Duplicate Position',
        joiningDate: '2026-11-25T00:00:00.000Z',
        roleCode: 'HR_EXECUTIVE'
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('STAFF_ALREADY_EXISTS');
  });

  it('GET /api/v1/staff returns paginated staff directory', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .get('/api/v1/staff?page=1&limit=10')
      .set('Authorization', 'Bearer valid.founder.token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.staff).toBeInstanceOf(Array);
    expect(res.body.data.staff.some((s) => s.id === provisionedStaffRecord.id)).toBe(true);
  });

  it('GET /api/v1/staff/:id returns specific staff member record', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .get(`/api/v1/staff/${provisionedStaffRecord.id}`)
      .set('Authorization', 'Bearer valid.founder.token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.staffCode).toBe(provisionedStaffRecord.staffCode);
    expect(res.body.data.user.email).toBe(staffCandidateEmail);
  });

  it('PATCH /api/v1/staff/:id updates designation', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .patch(`/api/v1/staff/${provisionedStaffRecord.id}`)
      .set('Authorization', 'Bearer valid.founder.token')
      .send({ designation: 'Senior HR Operations Specialist' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.designation).toBe('Senior HR Operations Specialist');
  });

  it('PATCH /api/v1/staff/:id/status toggles employment status to SUSPENDED', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .patch(`/api/v1/staff/${provisionedStaffRecord.id}/status`)
      .set('Authorization', 'Bearer valid.founder.token')
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.employmentStatus).toBe('SUSPENDED');

    // Verify user account status synchronized to SUSPENDED
    const userCheck = await prisma.user.findUnique({ where: { id: candidateUser.id } });
    expect(userCheck.status).toBe('SUSPENDED');
  });
});
