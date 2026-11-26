import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import app from '../../backend/src/app.js';
import prisma from '../../backend/src/config/database.js';
import firebase from '../../backend/src/integrations/firebase/firebaseService.js';
import { founderFixture, hasIsolatedDatabase, ensureCanonicalFounder } from './testDatabase.js';

describe.skipIf(!hasIsolatedDatabase())('Phase 10 Permanent Account Deletion & Security Integration', () => {
  const identities = new Map();

  function auth(actor) {
    return (actor.firebaseUid ?? actor) + '.synthetic';
  }

  function call(method, path, actor, body) {
    const req = request(app)[method](path)
      .set('Host', '127.0.0.1:3000')
      .set('X-Forwarded-For', '198.51.100.99');
    if (actor) req.set('Authorization', 'Bearer ' + auth(actor));
    return body === undefined ? req : req.send(body);
  }

  const get = (path, actor) => call('get', path, actor);
  const post = (path, data = {}, actor) => call('post', path, actor, data);

  let founderActor;
  let hrActor;
  let targetIntern;
  let testDepartment;
  let testInternship;
  let sharedTask;

  beforeAll(async () => {
    await ensureCanonicalFounder(prisma);

    identities.set(founderFixture.uid, { ...founderFixture, emailVerified: true });

    vi.spyOn(firebase, 'verifyIdToken').mockImplementation(async (token) => {
      const key = token.split('.')[0];
      const who = identities.get(key);
      if (!who) throw new Error('Unknown synthetic identity: ' + key);
      return {
        uid: who.uid,
        email: who.email,
        email_verified: who.emailVerified ?? true,
        aud: 'intellicore-dev',
        auth_time: Math.floor(Date.now() / 1000) - 20,
        firebase: { sign_in_provider: 'password' }
      };
    });

    // Setup Founder Actor
    founderActor = await prisma.user.upsert({
      where: { firebaseUid: founderFixture.uid },
      update: { status: 'ACTIVE', emailVerified: true },
      create: {
        firebaseUid: founderFixture.uid,
        email: founderFixture.email,
        status: 'ACTIVE',
        emailVerified: true,
        profile: { create: { fullName: 'Canonical Founder' } }
      }
    });
    const founderRole = await prisma.role.findUniqueOrThrow({ where: { code: 'FOUNDER' } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: founderActor.id, roleId: founderRole.id } },
      create: { userId: founderActor.id, roleId: founderRole.id },
      update: {}
    });

    // Setup HR Manager Actor
    const hrUid = 'test-hr-' + randomUUID();
    identities.set(hrUid, { uid: hrUid, email: hrUid + '@example.test', emailVerified: true });
    hrActor = await prisma.user.create({
      data: {
        firebaseUid: hrUid,
        email: hrUid + '@example.test',
        status: 'ACTIVE',
        emailVerified: true,
        profile: { create: { fullName: 'HR Manager' } },
        userRoles: { create: { role: { connect: { code: 'HR_MANAGER' } } } }
      }
    });

    // Setup Department
    testDepartment = await prisma.department.create({
      data: {
        name: 'Phase 10 Test Dept ' + randomUUID().slice(0, 8),
        code: 'P10_DEPT_' + randomUUID().slice(0, 8).toUpperCase(),
        slug: 'p10-dept-' + randomUUID().slice(0, 8)
      }
    });

    // Setup Target Intern with rich associations
    const targetUid = 'test-target-' + randomUUID();
    identities.set(targetUid, { uid: targetUid, email: targetUid + '@example.test', emailVerified: true });
    targetIntern = await prisma.user.create({
      data: {
        firebaseUid: targetUid,
        email: targetUid + '@example.test',
        status: 'ACTIVE',
        emailVerified: true,
        profile: { create: { fullName: 'Target Deletion Intern' } },
        userRoles: { create: { role: { connect: { code: 'INTERN' } } } },
        userDepartments: { create: { departmentId: testDepartment.id, assignedRole: 'INTERN' } }
      }
    });

    testInternship = await prisma.internship.create({
      data: {
        internshipCode: 'IC-P10-' + randomUUID().slice(0, 8).toUpperCase(),
        userId: targetIntern.id,
        departmentId: testDepartment.id,
        positionTitle: 'Web Development Intern',
        commencementDate: new Date('2026-01-01'),
        expectedCompletionDate: new Date('2026-03-31'),
        internshipStatus: 'ONGOING'
      }
    });

    // Add attendance and daily report
    const policy = await prisma.attendancePolicy.findFirst();
    if (policy) {
      await prisma.attendance.create({
        data: {
          internshipId: testInternship.id,
          policyId: policy.id,
          businessDate: new Date('2026-01-05T00:00:00.000Z'),
          checkInAt: new Date('2026-01-05T04:00:00Z'),
          checkOutAt: new Date('2026-01-05T13:00:00Z'),
          source: 'DASHBOARD'
        }
      });
    }

    // Create shared task authored by target user (to test shared record preservation)
    sharedTask = await prisma.task.create({
      data: {
        taskCode: 'TSK-P10-' + randomUUID().slice(0, 8).toUpperCase(),
        title: 'Shared Task Created By Intern',
        description: 'Organizational task that should be preserved',
        instructions: 'Follow instructions',
        deliverables: 'Deliverables summary',
        resources: [],
        rubric: [{ criterion: 'Execution', points: 100 }],
        taskType: 'DEPARTMENT',
        departmentId: testDepartment.id,
        createdBy: targetIntern.id,
        availableFrom: new Date('2026-01-01'),
        dueAt: new Date('2026-04-01')
      }
    });
  });

  afterAll(async () => {
    await ensureCanonicalFounder(prisma);
  });

  it('strictly restricts deletion preview and execution to primary Founder (denies HR Manager)', async () => {
    const previewRes = await post(`/api/v1/users/${targetIntern.id}/deletion-preview`, {}, hrActor);
    expect(previewRes.status).toBe(403);
    expect(['FORBIDDEN_ROLE', 'FOUNDER_REQUIRED']).toContain(previewRes.body.error.code);

    const executeRes = await post(`/api/v1/users/${targetIntern.id}/permanent-deletion`, {
      reason: 'Administrative test deletion',
      confirmationText: 'PERMANENTLY DELETE'
    }, hrActor);
    expect(executeRes.status).toBe(403);
    expect(['FORBIDDEN_ROLE', 'FOUNDER_REQUIRED']).toContain(executeRes.body.error.code);

    const jobsRes = await get('/api/v1/admin/deletion-jobs', hrActor);
    expect(jobsRes.status).toBe(403);
    expect(['FORBIDDEN_ROLE', 'FOUNDER_REQUIRED']).toContain(jobsRes.body.error.code);
  });

  it('strictly prevents primary Founder self-deletion and deletion of Founder account', async () => {
    // Founder targeting self
    const selfPreviewRes = await post(`/api/v1/users/${founderActor.id}/deletion-preview`, {}, founderActor);
    expect(selfPreviewRes.status).toBe(403);

    const selfExecRes = await post(`/api/v1/users/${founderActor.id}/permanent-deletion`, {
      reason: 'Attempt self deletion',
      confirmationText: 'PERMANENTLY DELETE'
    }, founderActor);
    expect(selfExecRes.status).toBe(403);
  });

  it('generates an accurate deletion impact preview with confirmation requirement', async () => {
    const res = await post(`/api/v1/users/${targetIntern.id}/deletion-preview`, {}, founderActor);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.targetUser.id).toBe(targetIntern.id);
    expect(data.targetUser.email).toBe(targetIntern.email);
    expect(data.impact.userAccount).toBe(1);
    expect(data.impact.internships).toBe(1);
    expect(data.impact.attendanceRecords).toBe(1);
    expect(data.sharedPreserved.sharedTasksPreserved).toBe(1);
    expect(typeof data.previewHash).toBe('string');
    expect(data.requiresConfirmationText).toBe('PERMANENTLY DELETE');
  });

  it('rejects permanent deletion when confirmation text is invalid or reason is insufficient', async () => {
    // Wrong confirmation text
    const badConfirmRes = await post(`/api/v1/users/${targetIntern.id}/permanent-deletion`, {
      reason: 'Valid administrative deletion reason',
      confirmationText: 'delete account'
    }, founderActor);
    expect(badConfirmRes.status).toBe(400);

    // Reason too short
    const shortReasonRes = await post(`/api/v1/users/${targetIntern.id}/permanent-deletion`, {
      reason: 'bad',
      confirmationText: 'PERMANENTLY DELETE'
    }, founderActor);
    expect(shortReasonRes.status).toBe(400);
  });

  it('executes durable permanent deletion, purging user records while preserving shared organizational tasks', async () => {
    // 1. Generate preview first
    const previewRes = await post(`/api/v1/users/${targetIntern.id}/deletion-preview`, {}, founderActor);
    const { previewHash, previewGeneratedAt } = previewRes.body.data;

    // 2. Execute permanent deletion
    const res = await post(`/api/v1/users/${targetIntern.id}/permanent-deletion`, {
      reason: 'Intern formal request and data purge per policy',
      confirmationText: 'PERMANENTLY DELETE',
      previewHash,
      previewTimestamp: previewGeneratedAt
    }, founderActor);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.targetEmail).toBe(targetIntern.email);

    // 3. Verify user record is completely gone from MySQL
    const userInDb = await prisma.user.findUnique({ where: { id: targetIntern.id } });
    expect(userInDb).toBeNull();

    // 4. Verify internship and attendance are purged
    const internshipInDb = await prisma.internship.findUnique({ where: { id: testInternship.id } });
    expect(internshipInDb).toBeNull();

    // 5. Verify shared task created by intern is preserved with author reassigned to Founder
    const preservedTask = await prisma.task.findUnique({ where: { id: sharedTask.id } });
    expect(preservedTask).not.toBeNull();
    expect(preservedTask.createdBy).toBe(founderActor.id);

    // 6. Verify minimal sanitized audit log exists
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'USER_PERMANENT_DELETION', resourceId: targetIntern.id }
    });
    expect(audit).not.toBeNull();
    expect(audit.actorUserId).toBe(founderActor.id);
    expect(audit.sanitizedAfter).toContain(targetIntern.id);
  });

  it('blocks authentication bootstrap from recreating permanently deleted identities', async () => {
    // Attempting to bootstrap with the deleted intern's credentials
    const bootstrapRes = await request(app)
      .post('/api/v1/auth/bootstrap')
      .set('Host', '127.0.0.1:3000')
      .set('X-Forwarded-For', '198.51.100.99')
      .set('Authorization', 'Bearer ' + targetIntern.firebaseUid + '.synthetic')
      .send({ fullName: 'Deleted User Attempting Re-entry' });

    expect(bootstrapRes.status).toBe(403);
    expect(bootstrapRes.body.error.code).toBe('ACCOUNT_DELETED');
  });

  it('lists recorded deletion jobs on the admin endpoint', async () => {
    const jobsRes = await get('/api/v1/admin/deletion-jobs', founderActor);
    expect(jobsRes.status).toBe(200);
    expect(jobsRes.body.success).toBe(true);
    expect(Array.isArray(jobsRes.body.data.jobs)).toBe(true);

    const targetJob = jobsRes.body.data.jobs.find((j) => j.targetEmail === targetIntern.email);
    expect(targetJob).toBeDefined();
    expect(targetJob.status).toBe('COMPLETED');
  });

  it('re-verifies certificate boundaries: public verification active, zero certificate email outbox jobs', async () => {
    // Negative probe against prohibited static PDF path
    const p2 = await get('/certificates/123.pdf', founderActor);
    expect(p2.status).toBe(404);

    // Public verification endpoint is functional and returns 200 with valid: false for unknown code
    const p3 = await get('/api/v1/certificates/verify/IC-CERT-123', founderActor);
    expect(p3.status).toBe(200);
    expect(p3.body.data.valid).toBe(false);

    // Verify 0 certificate email outbox jobs exist
    const certOutbox = await prisma.emailOutbox.findMany({
      where: { templateKey: { contains: 'certificate' } }
    });
    expect(certOutbox.length).toBe(0);
  });
});
