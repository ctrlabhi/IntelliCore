import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import { getPrismaClient } from '../../backend/src/config/database.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import auditService from '../../backend/src/modules/audit/auditService.js';
import { founderFixture, hasIsolatedDatabase } from './testDatabase.js';

const prisma = getPrismaClient();
const fixtures = new Map([['founder', founderFixture]]);
const auth = (call, actor) => call.set('Authorization', `Bearer ${actor}.fixture.token`);
const root = '/api/v1';
const applicationPath = (id) => `${root}/internship-applications/${id}`;
const internshipPath = (id) => `${root}/internships/${id}`;
const departmentPath = (id) => `${root}/departments/${id}`;

async function user(role, status = 'ACTIVE', emailVerified = true) {
  const uid = randomUUID();
  const email = `${uid}@example.test`;
  fixtures.set(uid, { uid, email, emailVerified });
  return prisma.user.create({ data: { firebaseUid: uid, email, emailVerified, status,
    profile: { create: { fullName: `Test ${role}` } }, userRoles: { create: { role: { connect: { code: role } } } }
  } });
}

async function createDepartment() {
  const suffix = randomUUID().slice(0, 12).replaceAll('-', '');
  const fields = { name: `Test Department ${suffix}`, code: `TEST_${suffix.toUpperCase()}`, slug: `test-${suffix}` };
  const response = await auth(request(app).post(`${root}/departments`).send(fields), 'founder');
  expect(response.status).toBe(201);
  return response.body.data;
}

async function createApplication(applicant, departmentId, { submitted = false, date = '2034-01-31' } = {}) {
  const response = await auth(request(app).post(`${root}/internship-applications`).send({
    departmentId, requestedStartDate: date, durationMonths: 1, qualification: 'Bachelor', institution: 'Test University'
  }), applicant.firebaseUid);
  expect(response.status).toBe(201);
  const { id } = response.body.data;
  if (submitted) {
    const result = await auth(request(app).post(`${applicationPath(id)}/submit`).send({}), applicant.firebaseUid);
    expect(result.status).toBe(200);
  }
  return id;
}

function approve(id, reviewer, fields = {}) {
  return auth(request(app).post(`${applicationPath(id)}/approve`).send({
    positionTitle: 'Internship fixture', commencementDate: '2034-01-31', ...fields
  }), reviewer.firebaseUid);
}

describe.skipIf(!hasIsolatedDatabase())('Phase 04 Supertest with migrated and seeded isolated MySQL', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(firebaseService, 'verifyIdToken').mockImplementation(async (token) => {
      const fixture = fixtures.get(token.split('.')[0]);
      if (!fixture) throw new Error('Unknown test token.');
      return { uid: fixture.uid, email: fixture.email, email_verified: fixture.emailVerified ?? true,
        aud: 'intellicore-dev', firebase: { sign_in_provider: 'password' } };
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('handles draft edits, revision, rejection, inactive departments and own-record visibility', async () => {
    const applicant = await user('INTERN', 'PENDING');
    const other = await user('INTERN', 'PENDING');
    const reviewer = await user('HR_MANAGER');
    const department = await createDepartment();
    const application = await createApplication(applicant, department.id);
    const path = applicationPath(application);
    const duplicate = await auth(request(app).post(`${root}/internship-applications`).send({
      departmentId: department.id, requestedStartDate: '2034-01-31', durationMonths: 1,
      qualification: 'Bachelor', institution: 'Test University'
    }), applicant.firebaseUid);
    expect(duplicate.body.error.code).toBe('APPLICATION_ALREADY_OPEN');
    const outsider = await auth(request(app).get(path), other.firebaseUid);
    expect(outsider.status).toBe(404);
    expect((await auth(request(app).patch(path).send({ skills: 'Updated skills' }), applicant.firebaseUid)).status).toBe(200);
    expect((await auth(request(app).post(`${path}/submit`).send({}), applicant.firebaseUid)).status).toBe(200);
    expect((await auth(request(app).patch(path).send({ skills: 'Locked' }), applicant.firebaseUid)).status).toBe(409);
    const revision = await auth(request(app).post(`${path}/request-changes`).send({ remarks: 'Please add a course.' }), reviewer.firebaseUid);
    expect(revision.body.data.applicationStatus).toBe('CHANGES_REQUESTED');
    expect((await auth(request(app).patch(path).send({ course: 'Updated course' }), applicant.firebaseUid)).status).toBe(200);
    expect((await auth(request(app).post(`${path}/submit`).send({}), applicant.firebaseUid)).status).toBe(200);
    const rejection = await auth(request(app).post(`${path}/reject`).send({ remarks: 'The placement is filled.' }), reviewer.firebaseUid);
    expect(rejection.body.data.applicationStatus).toBe('REJECTED');
    expect((await auth(request(app).patch(`${departmentPath(department.id)}/status`).send({ isActive: false }), 'founder')).status).toBe(200);
    const unavailable = await auth(request(app).post(`${root}/internship-applications`).send({
      departmentId: department.id, requestedStartDate: '2034-01-31', durationMonths: 1,
      qualification: 'Bachelor', institution: 'Test University'
    }), applicant.firebaseUid);
    expect(unavailable.body.error.code).toBe('DEPARTMENT_UNAVAILABLE');
  });

  it('serializes repeated approval and gives one internship code, activation and paired audit entries', async () => {
    const applicant = await user('INTERN', 'PENDING');
    const reviewer = await user('HR_MANAGER');
    const department = await createDepartment();
    const application = await createApplication(applicant, department.id, { submitted: true });
    const outcomes = await Promise.all([approve(application, reviewer), approve(application, reviewer)]);
    expect(outcomes.map(({ status }) => status).sort()).toEqual([200, 409]);
    const enrollment = await prisma.internship.findUniqueOrThrow({ where: { applicationId: application } });
    expect(enrollment.internshipCode).toMatch(/^IC-INT-[A-F0-9]{32}$/);
    expect(enrollment.expectedCompletionDate.toISOString().slice(0, 10)).toBe('2034-02-28');
    expect((await prisma.user.findUnique({ where: { id: applicant.id } })).status).toBe('ACTIVE');
    expect(await prisma.auditLog.count({ where: {
      OR: [
        { resourceId: application, action: 'APPLICATION_APPROVED' },
        { resourceId: enrollment.id, action: 'INTERNSHIP_ENROLLED' }
      ]
    } })).toBe(2);
    const future = await auth(request(app).post(`${internshipPath(enrollment.id)}/request-completion`).send({}), applicant.firebaseUid);
    expect(future.status).toBe(409);
  });

  it('prevents concurrent overlapping approval across departments', async () => {
    const applicant = await user('INTERN', 'PENDING');
    const reviewer = await user('HR_MANAGER');
    const departments = await Promise.all([createDepartment(), createDepartment()]);
    const ids = await Promise.all(departments.map((item) => createApplication(applicant, item.id, { submitted: true })));
    const outcomes = await Promise.all(ids.map((id) => approve(id, reviewer)));
    expect(outcomes.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(outcomes.find(({ status }) => status === 409).body.error.code).toBe('INTERNSHIP_OVERLAP');
    expect(await prisma.internship.count({ where: { userId: applicant.id } })).toBe(1);
  });

  it('rolls back enrollment, account activation, status and audit when an audit write fails', async () => {
    const applicant = await user('INTERN', 'PENDING');
    const reviewer = await user('HR_MANAGER');
    const department = await createDepartment();
    const application = await createApplication(applicant, department.id, { submitted: true });
    const writeAudit = auditService.createAuditLog.bind(auditService);
    vi.spyOn(auditService, 'createAuditLog').mockImplementation((client, event) => {
      if (event.action === 'INTERNSHIP_ENROLLED') throw new Error('Intentional test audit failure');
      return writeAudit(client, event);
    });
    expect((await approve(application, reviewer)).status).toBe(500);
    expect(await prisma.internship.count({ where: { applicationId: application } })).toBe(0);
    expect((await prisma.user.findUnique({ where: { id: applicant.id } })).status).toBe('PENDING');
    expect((await prisma.internshipApplication.findUnique({ where: { id: application } })).applicationStatus).toBe('PENDING_APPROVAL');
    expect(await prisma.auditLog.count({ where: { resourceId: application, action: 'APPLICATION_APPROVED' } })).toBe(0);
  });

  it('checks leader eligibility and blocks direct cross-department reads even after an enrollment is completed', async () => {
    const applicant = await user('INTERN', 'PENDING');
    const reviewer = await user('HR_MANAGER');
    const reader = await user('HR_EXECUTIVE');
    const leader = await user('TEAM_LEADER');
    await prisma.staffProfile.create({ data: {
      userId: leader.id, staffCode: `FIX-${randomUUID()}`, designation: 'Mentor', joiningDate: new Date()
    } });
    const department = await createDepartment();
    const application = await createApplication(applicant, department.id, { submitted: true, date: '2023-01-01' });
    const period = { commencementDate: '2023-01-01', expectedCompletionDate: '2023-02-01', assignedTeamLeaderId: leader.id };
    expect((await approve(application, reviewer, period)).body.error.code).toBe('TEAM_LEADER_NOT_ELIGIBLE');
    const assign = (isActive) => auth(request(app).put(`${departmentPath(department.id)}/staff`)
      .send({ userId: leader.id, assignedRole: 'TEAM_LEADER', isActive }), 'founder');
    expect((await assign(true)).status).toBe(200);
    const accepted = await approve(application, reviewer, period);
    expect(accepted.status).toBe(200);
    const path = internshipPath(accepted.body.data.internship.id);
    expect((await auth(request(app).get(path), leader.firebaseUid)).status).toBe(200);
    expect((await auth(request(app).post(`${path}/approve-completion`).send({}), reader.firebaseUid)).status).toBe(403);
    const completed = await auth(request(app).post(`${path}/approve-completion`).send({}), reviewer.firebaseUid);
    expect(completed.body.data.internshipStatus).toBe('COMPLETED');
    expect((await assign(false)).status).toBe(200);
    expect((await auth(request(app).get(path), leader.firebaseUid)).status).toBe(404);
    expect((await auth(request(app).get(path), applicant.firebaseUid)).body.data.internshipStatus).toBe('COMPLETED');
  });

  it('preserves a suspended applicant when review is attempted', async () => {
    const applicant = await user('INTERN', 'PENDING');
    const reviewer = await user('HR_MANAGER');
    const department = await createDepartment();
    const application = await createApplication(applicant, department.id, { submitted: true });
    await prisma.user.update({ where: { id: applicant.id }, data: { status: 'SUSPENDED' } });
    const result = await approve(application, reviewer);
    expect(result.body.error.code).toBe('APPLICANT_NOT_ELIGIBLE');
    expect((await prisma.user.findUnique({ where: { id: applicant.id } })).status).toBe('SUSPENDED');
    expect(await prisma.internship.count({ where: { applicationId: application } })).toBe(0);
  });

  it('provisions distinct verified staff concurrently and synchronizes suspension and reactivation', async () => {
    const candidates = await Promise.all([user('INTERN', 'PENDING'), user('INTERN', 'PENDING')]);
    const outcomes = await Promise.all(candidates.map(({ id }) => auth(request(app).post(`${root}/staff`).send({
      userId: id, designation: 'Test Team Leader', joiningDate: '2025-01-01', roleCode: 'TEAM_LEADER'
    }), 'founder')));
    expect(outcomes.map(({ status }) => status)).toEqual([201, 201]);
    expect(new Set(outcomes.map(({ body }) => body.data.staffCode)).size).toBe(2);
    const [first] = outcomes;
    for (const status of ['SUSPENDED', 'ACTIVE']) {
      const result = await auth(request(app).patch(`${root}/staff/${first.body.data.id}/status`).send({ status }), 'founder');
      expect(result.status).toBe(200);
      expect((await prisma.user.findUnique({ where: { id: candidates[0].id } })).status).toBe(status);
    }
  });

  it('records role matrix edits and leaves audit history read-only through HTTP', async () => {
    const role = await prisma.role.create({ data: { code: `TEST_${randomUUID()}`, name: 'Test Editable Role' } });
    const edit = await auth(request(app).put(`${root}/roles/${role.id}/permissions`).send({
      permissions: ['profile:read_own']
    }), 'founder');
    expect(edit.status).toBe(200);
    expect(edit.body.data.permissions).toEqual(['profile:read_own']);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: role.id, action: 'ROLE_PERMISSIONS_UPDATED' } });
    expect((await auth(request(app).delete(`${root}/audit-logs/${audit.id}`), 'founder')).status).toBe(404);
    expect(await prisma.auditLog.findUnique({ where: { id: audit.id } })).toBeTruthy();
  });
});
