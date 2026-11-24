import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import { getPrismaClient } from '../../backend/src/config/database.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import auditService from '../../backend/src/modules/audit/auditService.js';
import { lockUser } from '../../backend/src/utils/phase04.js';
import { syncAttendanceEligibility } from '../../backend/src/modules/attendance/eligibility.js';
import { founderFixture, hasIsolatedDatabase } from './testDatabase.js';

const db = getPrismaClient();
const api = '/api/v1';
const tokens = new Map([['founder', founderFixture]]);
const at = (value) => vi.setSystemTime(new Date(value));
const first = new Date('2034-02-06');
const last = new Date('2034-02-28');
const report = { workCompleted: 'Reviewed fixture work.', learningSummary: 'Practiced API testing.',
  progressSummary: 'Completed the baseline.', blockers: 'None.', nextDayPlan: 'Review follow-up fixtures.' };
const auth = (call, actor) => call.set('Authorization', `Bearer ${actor.firebaseUid || actor}.fixture.token`);
const get = (path, actor) => auth(request(app).get(api + path), actor);
const post = (path, actor, body = {}) => auth(request(app).post(api + path).send(body), actor);
const put = (path, actor, body) => auth(request(app).put(api + path).send(body), actor);
const attendance = (path, actor, body) => post(`/attendance/${path}`, actor, body);
const oneDay = '?from=2034-02-06&to=2034-02-06';

async function user(role, status = 'ACTIVE', verified = true, name = `Test ${role}`) {
  const firebaseUid = randomUUID();
  const email = `${firebaseUid}@example.test`;
  tokens.set(firebaseUid, { uid: firebaseUid, email, verified });
  return db.user.create({ data: { firebaseUid, email, emailVerified: verified, status,
    profile: { create: { fullName: name } },
    userRoles: { create: { role: { connect: { code: role } } } }
  } });
}

async function enrollment({ status = 'ACTIVE', verified = true, internshipStatus = 'APPROVED', start = first,
  department = 'WEB_DEV', name } = {}) {
  const account = await user('INTERN', status, verified, name);
  const target = await db.department.findUniqueOrThrow({ where: { code: department } });
  const application = await db.internshipApplication.create({ data: { applicantUserId: account.id, departmentId: target.id,
    applicationStatus: 'APPROVED', requestedStartDate: start, requestedDuration: '1', institution: 'Test University',
    qualification: 'Test Qualification' } });
  const internship = await db.internship.create({ data: {
    internshipCode: `FIX05-${randomUUID()}`, userId: account.id, applicationId: application.id,
    departmentId: target.id, positionTitle: 'Phase 05 test intern', commencementDate: start, expectedCompletionDate: last,
    internshipStatus
  } });
  await db.$transaction(async (tx) => {
    await lockUser(tx, account.id);
    await syncAttendanceEligibility(tx, account.id, new Date('2034-02-05T12:00:00Z'));
  });
  return { account, internship };
}

describe.skipIf(!hasIsolatedDatabase())('Phase 05 with migrated isolated MySQL and synthetic Firebase identity', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2034-02-06T04:00:00Z');
    vi.spyOn(firebaseService, 'verifyIdToken').mockImplementation(async (token) => {
      const identity = tokens.get(token.split('.')[0]);
      if (!identity) throw new Error('Unknown fixture.');
      return { uid: identity.uid, email: identity.email, email_verified: identity.verified ?? true,
        aud: 'intellicore-dev', firebase: { sign_in_provider: 'password' } };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses the actual server event and deduplicates simultaneous dashboard requests', async () => {
    const { account, internship } = await enrollment();
    at('2034-02-06T03:59:59.999Z');
    const upcoming = await attendance('check-in', account);
    expect(upcoming.body.data).toMatchObject({ state: 'BEFORE_SHIFT', checkInAt: null, nextCheckInAt: '2034-02-06T04:00:00.000Z' });
    expect(await db.attendance.count({ where: { internshipId: internship.id } })).toBe(0);
    expect((await attendance('check-in', account, { checkInAt: '2034-02-06T04:00:00Z' })).status).toBe(400);
    at('2034-02-06T04:00:01Z');
    const responses = await Promise.all([attendance('check-in', account), attendance('check-in', account)]);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(new Set(responses.map(({ body }) => body.data.id)).size).toBe(1);
    expect(responses.map(({ body }) => body.data.recorded).sort()).toEqual([false, true]);
    expect(responses[0].body.data).toMatchObject({ checkInAt: '2034-02-06T04:00:01.000Z', isLate: true, lateMinutes: 1 });
    expect(await db.attendance.count({ where: { internshipId: internship.id } })).toBe(1);
  });

  it('denies non-intern and restricted identities and skips weekends, future and terminal internship dates', async () => {
    const [pending, suspended, rejected, inactive, unverified, future, terminal, completed, weekend] = await Promise.all([
      enrollment({ status: 'PENDING' }), enrollment({ status: 'SUSPENDED' }), enrollment({ status: 'REJECTED' }),
      enrollment({ status: 'INACTIVE' }), enrollment({ verified: false }), enrollment({ start: new Date('2034-02-07') }),
      enrollment({ internshipStatus: 'TERMINATED' }), enrollment({ internshipStatus: 'COMPLETED' }), enrollment()
    ]);
    for (const actor of [pending.account, suspended.account, rejected.account, inactive.account, unverified.account, 'founder']) {
      expect((await attendance('check-in', actor)).status).toBe(403);
    }
    for (const entry of [future, terminal, completed]) expect((await attendance('check-in', entry.account)).body.data.state).toBe('NOT_ELIGIBLE');
    at('2034-02-11T04:00:00Z');
    expect((await attendance('check-in', weekend.account)).body.data.state).toBe('WEEKLY_OFF');
    at('2034-02-13T13:00:00.001Z');
    expect((await attendance('check-in', weekend.account)).body.data).toMatchObject({ status: 'ABSENT', id: null });
    expect(await db.attendance.count({ where: { internshipId: { in:
      [pending, suspended, rejected, inactive, unverified, future, terminal, completed, weekend].map(({ internship }) => internship.id) } } }))
      .toBe(0);
  });

  it('records explicit checkout once, marks early departure and never closes an overnight row', async () => {
    const { account } = await enrollment();
    const firstDay = (await attendance('check-in', account)).body.data;
    at('2034-02-07T04:00:00Z');
    const none = await attendance('check-out', account);
    expect(none.body.data.recorded).toBe(false);
    expect((await db.attendance.findUniqueOrThrow({ where: { id: firstDay.id } })).checkOutAt).toBeNull();
    const nextDay = (await attendance('check-in', account)).body.data;
    at('2034-02-07T10:00:00Z');
    const out = await attendance('check-out', account);
    expect(out.body.data).toMatchObject({ id: nextDay.id, recorded: true, checkOutAt: '2034-02-07T10:00:00.000Z',
      isEarlyDeparture: true, earlyDepartureMinutes: 180, reportReminder: true });
    at('2034-02-07T10:01:00Z');
    expect((await attendance('check-out', account)).body.data)
      .toMatchObject({ recorded: false, checkOutAt: '2034-02-07T10:00:00.000Z' });
    expect((await get(`/attendance/${firstDay.id}`, account)).body.data)
      .toMatchObject({ status: 'INCOMPLETE', missingCheckOut: true, missingDailyReport: true });
  });

  it('submits immutable reports without authoring attendance and enforces the 20:00 cutoff', async () => {
    const { account, internship } = await enrollment();
    const draft = await put('/daily-work-reports/me/today', account, { workCompleted: 'Starting draft.' });
    expect(draft.body.data.status).toBe('DRAFT');
    expect((await post('/daily-work-reports/me/today/submit', account)).status).toBe(400);
    expect((await put('/daily-work-reports/me/today', account, { ...report, businessDate: '2034-02-05' })).status).toBe(400);
    await put('/daily-work-reports/me/today', account, report);
    const submitted = await post('/daily-work-reports/me/today/submit', account);
    expect(submitted.body.data).toMatchObject({ status: 'SUBMITTED', businessDate: '2034-02-06T00:00:00.000Z' });
    expect((await put('/daily-work-reports/me/today', account, report)).status).toBe(409);
    expect(await db.attendance.count({ where: { internshipId: internship.id } })).toBe(0);
    at('2034-02-07T14:30:00Z');
    expect((await put('/daily-work-reports/me/today', account, report)).body.error.code).toBe('REPORT_WINDOW_CLOSED');
  });

  it('approves working-day leave only with authorized reconciliation and retains original check-in', async () => {
    const { account, internship } = await enrollment();
    const hr = await user('HR_MANAGER');
    const hrExecutive = await user('HR_EXECUTIVE');
    const inRecord = (await attendance('check-in', account)).body.data;
    const input = { internshipId: internship.id, leaveType: 'CASUAL_LEAVE', startDate: '2034-02-06', endDate: '2034-02-13',
      reason: 'Fixture leave with attendance already recorded.' };
    const requestResult = await post('/leave-requests', account, input);
    expect(requestResult.body.data).toMatchObject({ workingDays: 6, status: 'PENDING', hasRecordedActivity: true });
    const id = requestResult.body.data.id;
    expect((await post('/leave-requests', account, input)).body.error.code).toBe('LEAVE_OVERLAP');
    expect((await post(`/leave-requests/${id}/approve`, hrExecutive, { remarks: 'Reviewed approved request.' })).status).toBe(403);
    expect((await post(`/leave-requests/${id}/approve`, hr, { remarks: 'Reviewed approved request.' })).body.error.code)
      .toBe('LEAVE_RECONCILIATION_REQUIRED');
    const approval = await post(`/leave-requests/${id}/approve`, hr, { remarks: 'Recorded activity reviewed and retained.', reconcileActivity: true });
    expect(approval.body.data).toMatchObject({ status: 'APPROVED', reconciledActivity: true });
    expect((await get(`/attendance/${inRecord.id}`, account)).body.data).toMatchObject({
      status: 'ON_LEAVE', checkInAt: inRecord.checkInAt
    });
    at('2034-02-07T04:01:00Z');
    expect((await attendance('check-in', account)).body.data).toMatchObject({ status: 'ON_LEAVE', id: null });
  });

  it('supports future approved cancellation, rejection and date validation without leaving exemptions', async () => {
    const { account, internship } = await enrollment();
    const hr = await user('HR_MANAGER');
    const leave = { internshipId: internship.id, leaveType: 'SICK_LEAVE',
      startDate: '2034-02-10', endDate: '2034-02-10', reason: 'Documented fixture leave reason.' };
    expect((await post('/leave-requests', account, { ...leave, endDate: '2034-02-09' })).status).toBe(400);
    expect((await post('/leave-requests', account, { ...leave, startDate: '2034-02-11', endDate: '2034-02-12' }))
      .body.error.code).toBe('NO_WORKING_LEAVE_DAYS');
    const firstLeave = await post('/leave-requests', account, leave);
    const approval = await post(`/leave-requests/${firstLeave.body.data.id}/approve`, hr, { remarks: 'Approved after fixture review.' });
    expect(approval.body.data.status).toBe('APPROVED');
    const cancel = await post(`/leave-requests/${firstLeave.body.data.id}/cancel`, account);
    expect(cancel.body.data.status).toBe('CANCELLED');
    const secondLeave = await post('/leave-requests', account, leave);
    expect((await post(`/leave-requests/${secondLeave.body.data.id}/reject`, hr, { remarks: 'Rejected after fixture review.' })).body.data.status)
      .toBe('REJECTED');
    at('2034-02-10T04:00:00Z');
    expect((await attendance('check-in', account)).body.data.recorded).toBe(true);
  });

  it('serializes a leave decision with a concurrent check-in for the same day', async () => {
    const { account, internship } = await enrollment();
    const hr = await user('HR_MANAGER');
    const leave = await post('/leave-requests', account, { internshipId: internship.id, leaveType: 'SICK_LEAVE',
      startDate: '2034-02-06', endDate: '2034-02-06', reason: 'Concurrent protected leave approval.' });
    const [checkIn, approval] = await Promise.all([
      attendance('check-in', account),
      post(`/leave-requests/${leave.body.data.id}/approve`, hr, { remarks: 'Eligible leave after review.' })
    ]);
    expect(checkIn.status).toBe(200);
    if (approval.status === 200) {
      expect(checkIn.body.data.status).toBe('ON_LEAVE');
      expect(await db.attendance.count({ where: { internshipId: internship.id } })).toBe(0);
    } else {
      expect(approval.body.error.code).toBe('LEAVE_RECONCILIATION_REQUIRED');
      expect(checkIn.body.data.recorded).toBe(true);
      expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: leave.body.data.id } })).status).toBe('PENDING');
    }
  });

  it('preserves correction originals and approves timestamp and late-report changes atomically', async () => {
    const { account, internship } = await enrollment();
    const hr = await user('HR_MANAGER');
    const leader = await user('TEAM_LEADER');
    const original = (await attendance('check-in', account)).body.data;
    at('2034-02-06T15:00:00Z');
    const input = { internshipId: internship.id, businessDate: '2034-02-06', kind: 'TIMESTAMPS',
      reason: 'Network interrupted the explicit logout.', proposedChanges: { checkOutAt: '2034-02-06T18:15:00+05:30' } };
    expect((await post('/attendance-corrections', account, { ...input,
      proposedChanges: { checkOutAt: '2034-02-07T00:01:00+05:30' } })).status).toBe(400);
    const correction = await post('/attendance-corrections', account, input);
    const id = correction.body.data.id;
    expect(correction.body.data.originalValues).toMatchObject({ checkInAt: original.checkInAt, checkOutAt: null, source: 'DASHBOARD' });
    expect((await db.attendance.findUniqueOrThrow({ where: { id: original.id } })).checkOutAt).toBeNull();
    expect((await post(`/attendance-corrections/${id}/approve`, leader, { remarks: 'Verified record reviewed.' })).status).toBe(403);
    expect((await post(`/attendance-corrections/${id}/approve`, hr, { remarks: 'Verified record reviewed.' })).body.data.status).toBe('APPROVED');
    const late = await post('/attendance-corrections', account, { ...input, kind: 'LATE_REPORT',
      proposedChanges: report, reason: 'Requested late acceptance after a network failure.' });
    expect((await post(`/attendance-corrections/${late.body.data.id}/approve`, hr, { remarks: 'Verified late report.' })).body.data.status)
      .toBe('APPROVED');
    const revised = await get(`/attendance/${original.id}`, account);
    expect(revised.body.data).toMatchObject({ status: 'PRESENT', source: 'CORRECTION', isEarlyDeparture: true, earlyDepartureMinutes: 15 });
    expect(await db.auditLog.count({ where: { resourceId: { in: [id, late.body.data.id] }, action: 'ATTENDANCE_CORRECTION_APPROVED' } }))
      .toBe(2);
    const reports = await get('/daily-work-reports/me', account);
    expect(reports.body.data.items[0]).toMatchObject({ status: 'SUBMITTED', lateApprovedAt: '2034-02-06T15:00:00.000Z' });
  });

  it('keeps effective historical eligibility through suspension and reactivation', async () => {
    const { account, internship } = await enrollment();
    at('2034-02-07T03:00:00Z');
    const suspend = await auth(request(app).patch(`${api}/users/${account.id}/status`).send({ status: 'SUSPENDED' }), 'founder');
    expect(suspend.status).toBe(200);
    at('2034-02-09T08:00:00Z');
    const reactivate = await auth(request(app).patch(`${api}/users/${account.id}/status`).send({ status: 'ACTIVE' }), 'founder');
    expect(reactivate.status).toBe(200);
    at('2034-02-10T15:00:00Z');
    const history = await get(`/attendance/me?from=2034-02-06&to=2034-02-10&internshipId=${internship.id}`, account);
    const byDate = Object.fromEntries(history.body.data.items.map((item) => [item.businessDate, item]));
    expect(byDate['2034-02-06'].status).toBe('ABSENT');
    expect(byDate['2034-02-07'].status).toBeNull();
    expect(byDate['2034-02-08']).toBeUndefined();
    expect(byDate['2034-02-09'].status).toBeNull();
    expect(byDate['2034-02-10'].status).toBe('ABSENT');
    expect(await db.attendance.count({ where: { internshipId: internship.id } })).toBe(0);
  });

  it('rolls back timestamp corrections when the admin audit write fails', async () => {
    const { account, internship } = await enrollment();
    const hr = await user('HR_MANAGER');
    const original = (await attendance('check-in', account)).body.data;
    at('2034-02-06T15:00:00Z');
    const correction = await post('/attendance-corrections', account, {
      internshipId: internship.id, businessDate: '2034-02-06', kind: 'TIMESTAMPS',
      reason: 'Verified missing checkout correction.', proposedChanges: { checkOutAt: '2034-02-06T18:30:00+05:30' }
    });
    const recordAudit = auditService.createAuditLog.bind(auditService);
    vi.spyOn(auditService, 'createAuditLog').mockImplementation((client, payload) => {
      if (payload.action === 'ATTENDANCE_CORRECTION_APPROVED') throw new Error('Intentionally failed fixture audit write');
      return recordAudit(client, payload);
    });
    expect((await post(`/attendance-corrections/${correction.body.data.id}/approve`, hr, { remarks: 'Verified admin correction.' })).status).toBe(500);
    const row = await db.attendance.findUniqueOrThrow({ where: { id: original.id } });
    expect(row.checkOutAt).toBeNull();
    expect(row.revision).toBe(0);
    expect((await db.attendanceCorrection.findUniqueOrThrow({ where: { id: correction.body.data.id } })).status).toBe('PENDING');
  });

  it('scopes roster, report and detail reads and exports formula-safe CSV', async () => {
    const fixtureName = `=Test formula ${randomUUID()}`;
    const firstIntern = await enrollment({ name: fixtureName });
    const secondIntern = await enrollment({ department: 'DATA_ANALYTICS' });
    const leader = await user('TEAM_LEADER');
    await db.staffProfile.create({ data: { userId: leader.id, staffCode: `FX-${randomUUID()}`,
      designation: 'Fixture Mentor', joiningDate: first } });
    await db.userDepartment.create({ data: { userId: leader.id, departmentId: firstIntern.internship.departmentId, assignedRole: 'TEAM_LEADER' } });
    const ownAttendance = (await attendance('check-in', firstIntern.account)).body.data;
    const otherAttendance = (await attendance('check-in', secondIntern.account)).body.data;
    await put('/daily-work-reports/me/today', firstIntern.account, report);
    const draft = await get('/daily-work-reports' + oneDay, leader);
    expect(draft.body.data.items.some((item) => item.internshipId === firstIntern.internship.id)).toBe(false);
    await post('/daily-work-reports/me/today/submit', firstIntern.account);
    await put('/daily-work-reports/me/today', secondIntern.account, report);
    const otherReport = await post('/daily-work-reports/me/today/submit', secondIntern.account);
    const visible = await get('/attendance' + oneDay + `&search=${encodeURIComponent(fixtureName)}`, leader);
    expect(visible.body.data.items.some(({ id }) => id === ownAttendance.id)).toBe(true);
    expect(visible.body.data.items.some(({ id }) => id === otherAttendance.id)).toBe(false);
    expect((await get(`/attendance/${otherAttendance.id}`, leader)).status).toBe(404);
    expect((await get(`/daily-work-reports/${otherReport.body.data.id}`, leader)).status).toBe(404);
    expect((await get(`/attendance/${ownAttendance.id}`, secondIntern.account)).status).toBe(404);
    expect((await post('/attendance-corrections', secondIntern.account, { businessDate: '2034-02-06',
      internshipId: firstIntern.internship.id, kind: 'LATE_REPORT', reason: 'Fixture scope check.', proposedChanges: report })).status).toBe(404);
    expect((await get('/attendance/export' + oneDay, leader)).status).toBe(403);
    const csv = await get('/attendance/export' + oneDay + `&internshipId=${firstIntern.internship.id}`, 'founder');
    expect(csv.header['content-type']).toMatch('text/csv');
    expect(csv.text).toContain("'=Test formula");
    expect(csv.text).not.toContain(report.workCompleted);
  });

  it('publishes future policy versions only through the primary Founder and documents static routes', async () => {
    const cofounder = await user('CO_FOUNDER');
    const payload = { name: 'Fixture schedule', effectiveFrom: '2034-03-01' };
    expect((await post('/attendance/policies', cofounder, payload)).status).toBe(403);
    expect((await post('/attendance/policies', 'founder', { ...payload, effectiveFrom: '2034-02-06' })).status).toBe(409);
    const future = new Date('2034-03-01');
    const label = `Fixture schedule ${randomUUID()}`;
    while (await db.attendancePolicy.findUnique({ where: { effectiveFrom: future } })) {
      future.setUTCDate(future.getUTCDate() + 1);
    }
    const created = await post('/attendance/policies', 'founder', { name: label, effectiveFrom: future.toISOString().slice(0, 10) });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ workingDays: [1, 2, 3, 4, 5], checkInTime: '09:30', graceMinutes: 0 });
    const swagger = await request(app).get('/api-docs.json');
    expect(swagger.body.paths['/api/v1/attendance/export'].get.responses[200].content['text/csv']).toBeDefined();
    expect(swagger.body.paths['/api/v1/attendance-corrections/{id}/approve'].post).toBeDefined();
  });
});
