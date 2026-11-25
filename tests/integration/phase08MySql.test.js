import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import prisma from '../../backend/src/config/database.js';
import firebase from '../../backend/src/integrations/firebase/firebaseService.js';
import audit from '../../backend/src/modules/audit/auditService.js';
import { eligibleInternship, syncAttendanceEligibility } from '../../backend/src/modules/attendance/eligibility.js';
import { processCalendarMeeting, runMeetingReminders } from '../../backend/src/modules/meetings/meetingWorker.js';
import { CalendarError } from '../../backend/src/integrations/google-calendar/calendarService.js';
import { claimEmails, processEmailJob, workerOptions } from '../../backend/src/modules/notifications/emailQueue.js';
import { digest } from '../../backend/src/modules/notifications/notificationPolicy.js';
import { founderFixture, hasIsolatedDatabase } from './testDatabase.js';

const identities = new Map([['founder', founderFixture]]);
const clock = new Date('2042-07-14T08:00:00Z');
const iso = (day) => new Date(day + 'T00:00:00Z');
const auth = (actor = 'founder') => (actor.firebaseUid ?? actor) + '.synthetic';
let address = 0;
function call(method, path, actor, body) {
  const response = request(app)[method]('/api/v1' + path).set('Authorization', 'Bearer ' + auth(actor))
    .set('X-Forwarded-For', '198.51.100.' + address);
  return body === undefined ? response : response.send(body);
}
const get = (path, actor) => call('get', path, actor);
const post = (path, data = {}, actor) => call('post', path, actor, data);
const body = (response, status = 200) => {
  expect(response.status, JSON.stringify(response.body.error)).toBe(status);
  return response.body.data;
};
const periodPath = (intern, suffix) => '/internships/' + intern.id + suffix;
const meetingPath = (id, action) => '/meetings/' + id + (action ? '/' + action : '');
const declaration = () => ({ requestKey: randomUUID(), confirmed: true, declaredSentAt: '2042-07-14T07:55:00Z' });
const completed = { internshipStatus: 'COMPLETED', actualCompletionDate: iso('2042-07-10'),
  completionApprovedAt: new Date('2042-07-13T10:00:00Z'), expectedCompletionDate: iso('2042-07-10') };

async function actor(role = 'INTERN', status = 'ACTIVE', stale = false) {
  const uid = randomUUID();
  const email = uid + '@example.test';
  identities.set(uid, { uid, email, stale });
  return prisma.user.create({ data: { firebaseUid: uid, email, emailVerified: true, status,
    profile: { create: { fullName: 'Phase 08 ' + role } },
    userRoles: { create: { role: { connect: { code: role } } } } } });
}

async function department() {
  const slug = 'p8-' + randomUUID().slice(0, 8);
  return prisma.department.create({ data: { name: slug, slug, code: slug } });
}

async function enrollment(dept, user, data = completed) {
  const person = user ?? await actor();
  const start = data.commencementDate ?? iso('2042-07-01');
  const application = await prisma.internshipApplication.create({ data: { applicantUserId: person.id, departmentId: dept.id,
    applicationStatus: 'APPROVED', requestedStartDate: start, requestedDuration: 'Test', qualification: 'Test', institution: 'Example' } });
  const intern = await prisma.internship.create({ data: { userId: person.id, applicationId: application.id,
    departmentId: dept.id, internshipCode: 'P8-' + randomUUID(), positionTitle: 'Intern',
    commencementDate: start, expectedCompletionDate: iso('2042-07-31'), approvedAt: iso('2042-06-29'), ...data } });
  return { person, intern, application };
}

async function leader(dept) {
  const user = await actor('TEAM_LEADER');
  await prisma.staffProfile.create({ data: { userId: user.id, staffCode: 'P8-' + randomUUID(),
    designation: 'Leader', joiningDate: iso('2042-07-01') } });
  const membership = await prisma.userDepartment.create({ data: { departmentId: dept.id, userId: user.id, assignedRole: 'TEAM_LEADER' } });
  return { user, membership };
}

function meeting(data = {}) {
  return { title: 'Phase 08 session', description: 'Review synthetic evidence', audienceType: 'SELECTED_USERS',
    startAt: '2042-07-14T09:00:00Z', endAt: '2042-07-14T09:30:00Z',
    meetingUrl: 'https://meet.google.com/abc-defg-hij', ...data };
}

async function schedule(item, organizer) {
  const preview = body(await post(meetingPath(item.id, 'preview-audience'), {}, organizer));
  return body(await post(meetingPath(item.id, 'schedule'), {
    expectedVersion: preview.version, previewToken: preview.previewToken
  }, organizer));
}

describe.skipIf(!hasIsolatedDatabase())('Phase 08 with isolated MySQL and synthetic Firebase identities', () => {
  beforeEach(() => {
    address += 1;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(clock);
    vi.spyOn(firebase, 'verifyIdToken').mockImplementation(async (token) => {
      const who = identities.get(token.split('.')[0]);
      if (!who) throw new Error('Unknown synthetic identity');
      return { uid: who.uid, email: who.email, email_verified: true, aud: 'intellicore-dev',
        auth_time: Date.now() / 1000 - (who.stale ? 3600 : 20), firebase: { sign_in_provider: 'password' } };
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('authorizes certificate marking across eight roles, requires explicit confirmation and preserves own reads', async () => {
    const dept = await department();
    const { person, intern } = await enrollment(dept);
    const path = periodPath(intern, '/certificate-email-status');
    const blocked = await Promise.all(['CO_FOUNDER', 'ADMIN', 'HR_EXECUTIVE', 'OPERATIONS_EXECUTIVE', 'TEAM_LEADER', 'INTERN'].map((role) => actor(role)));
    for (const account of blocked) body(await post(path + '/mark-sent', declaration(), account), 403);
    body(await get(path, blocked.at(-1)), 404);
    expect(body(await get(path, blocked[2])).history.items).toEqual([]);
    const hr = await actor('HR_MANAGER');
    body(await post(path + '/mark-sent', { ...declaration(), confirmed: false }, hr), 400);
    const pending = await enrollment(dept, undefined, { internshipStatus: 'ONGOING' });
    body(await post(periodPath(pending.intern, '/certificate-email-status/mark-sent'), declaration(), hr), 409);
    const item = body(await post(path + '/mark-sent', declaration()));
    expect(item).toMatchObject({ status: 'SENT', recordedByAuthorizedTeam: true,
      message: 'Your internship certificate has been sent to your registered email address. Please check your inbox and spam folder.' });
    expect(body(await get(path, person))).not.toHaveProperty('history');
    expect(body(await get('/internships/me', person)).items[0].certificateEmailStatus.status).toBe('SENT');
    expect(body(await get('/internships/followups/completed?dispatchStatus=SENT&search=' + intern.internshipCode, hr)).items[0].id).toBe(intern.id);
  });

  it('serializes duplicate declarations, makes audit and notice atomic, and supersedes corrected notices without mail', async () => {
    const [dept, hr] = await Promise.all([department(), actor('HR_MANAGER')]);
    const { person, intern } = await enrollment(dept);
    const path = periodPath(intern, '/certificate-email-status');
    const failed = vi.spyOn(audit, 'createAuditLog').mockRejectedValueOnce(new Error('Audit unavailable'));
    body(await post(path + '/mark-sent', declaration(), hr), 500);
    failed.mockRestore();
    expect(await prisma.certificateDispatch.count({ where: { internshipId: intern.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { relatedResourceId: intern.id } })).toBe(0);

    const input = declaration();
    for (const item of await Promise.all([post(path + '/mark-sent', input, hr), post(path + '/mark-sent', input, hr)])) body(item);
    expect(await prisma.certificateDispatch.count({ where: { internshipId: intern.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { relatedResourceId: intern.id, recipientUserId: person.id } })).toBe(1);
    body(await post(path + '/correct', { requestKey: randomUUID(), reason: 'Incorrect external dispatch declaration' }, hr));
    expect(body(await post(path + '/mark-sent', input, hr)).status).toBe('NOT_SENT');
    const old = await prisma.notification.findFirstOrThrow({ where: { eventType: 'CERTIFICATE_DISPATCH_RECORDED', relatedResourceId: intern.id } });
    expect(old.archivedAt).toBeTruthy();
    expect(old.message).toContain('superseded');
    body(await post(path + '/mark-sent', declaration(), hr));
    expect(body(await get(path, hr)).history.items.map((row) => row.status)).toEqual(['SENT', 'NOT_SENT', 'SENT']);
    expect(await prisma.emailOutbox.count({ where: { notification: { relatedResourceId: intern.id } } })).toBe(0);
    expect(body(await get(path, person))).not.toHaveProperty('downloadUrl');
    expect((await get('/certificates/me', person)).status).toBe(404);
  });

  it('rejects even injected certificate outbox records in capture, disabled and SMTP worker runs', async () => {
    const [dept, hr] = await Promise.all([department(), actor('HR_MANAGER')]);
    const { person, intern } = await enrollment(dept);
    body(await post(periodPath(intern, '/certificate-email-status/mark-sent'), declaration(), hr));
    const notice = await prisma.notification.findFirstOrThrow({ where: { relatedResourceId: intern.id,
      eventType: 'CERTIFICATE_DISPATCH_RECORDED' } });
    const transport = vi.fn(() => { throw new Error('No transport should be created'); });
    const options = workerOptions();
    for (const mode of ['CAPTURE', 'DISABLED', 'SMTP']) {
      const at = new Date('1001-01-01T00:00:00Z');
      const injected = await prisma.emailOutbox.create({ data: { recipientUserId: person.id, recipientEmail: person.email, notificationId: notice.id,
        templateKey: 'internship-completed', templateData: { event: notice.eventType, actionPath: notice.actionPath },
        authorization: { type: 'INTERNSHIP', resourceId: intern.id, version: '' }, deduplicationKey: digest([notice.id, mode]),
        availableAt: at, nextAttemptAt: at } });
      const claimed = (await claimEmails(prisma, 'worker-' + mode, clock, 1)).find(({ id }) => id === injected.id);
      expect(claimed).toBeDefined();
      expect(await processEmailJob(prisma, claimed, { mode }, options, { clock: () => clock, createTransport: transport }))
        .toMatchObject({ status: 'CANCELLED' });
      await prisma.emailDeliveryAttempt.deleteMany({ where: { emailOutboxId: injected.id } });
      await prisma.emailOutbox.delete({ where: { id: injected.id } });
    }
    expect(transport).not.toHaveBeenCalled();
    expect(await prisma.emailOutbox.count({ where: { notificationId: notice.id } })).toBe(0);
  });

  it('creates one future continuation, preserves original history and gates operations across the gap', async () => {
    const [dept, hr] = await Promise.all([department(), actor('HR_MANAGER')]);
    const { person, intern, application } = await enrollment(dept);
    const path = periodPath(intern, '/extensions');
    body(await post(periodPath(intern, '/certificate-email-status/mark-sent'), declaration(), hr));
    const before = await prisma.internship.findUnique({ where: { id: intern.id } });
    const count = await prisma.internshipApplication.count({ where: { applicantUserId: person.id } });
    const extension = { startsOn: '2042-07-20', durationDays: 14, reason: 'Additional training' };
    const attempts = await Promise.all([post(path, extension, hr), post(path, extension, hr)]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([201, 409]);
    const row = body(attempts.find(({ status }) => status === 201), 201);
    expect(row.continuation).toMatchObject({ internshipStatus: 'APPROVED',
      expectedCompletionDate: '2042-08-02T00:00:00.000Z' });
    expect(await prisma.internship.findUnique({ where: { id: intern.id } })).toEqual(before);
    expect(before.applicationId).toBe(application.id);
    expect(await prisma.internshipApplication.count({ where: { applicantUserId: person.id } })).toBe(count);
    expect(await eligibleInternship(prisma, person.id, iso('2042-07-19'))).toBeNull();
    expect((await eligibleInternship(prisma, person.id, iso('2042-07-20'))).id).toBe(row.continuation.id);
    expect(await prisma.attendance.count({ where: { internshipId: row.continuation.id } })).toBe(0);
    expect(await prisma.taskAssignment.count({ where: { internshipId: row.continuation.id } })).toBe(0);
    expect(await prisma.learningEnrollment.count({ where: { internshipId: row.continuation.id } })).toBe(0);
    expect(body(await get(periodPath(intern, '/certificate-email-status'), person)).status).toBe('SENT');
    expect(body(await get(periodPath(row.continuation, '/certificate-email-status'), person)).status).toBe('NOT_SENT');
    expect(body(await get('/notifications/me', person)).items.some((item) => item.eventType === 'INTERNSHIP_EXTENDED')).toBe(true);
  });

  it('validates ongoing extension dates, blocks overlapping periods, and cancels only unused future decisions', async () => {
    const [dept, hr] = await Promise.all([department(), actor('HR_MANAGER')]);
    const { person, intern } = await enrollment(dept, undefined, { internshipStatus: 'ONGOING' });
    await prisma.$transaction((tx) => syncAttendanceEligibility(tx, person.id, clock));
    await enrollment(dept, person, { internshipStatus: 'APPROVED', commencementDate: iso('2042-08-04'), expectedCompletionDate: iso('2042-08-11') });
    const path = periodPath(intern, '/extensions');
    body(await post(path, { startsOn: '2042-08-02', endsOn: '2042-08-03', reason: 'Gap' }, hr), 400);
    body(await post(path, { startsOn: '2042-08-01', endsOn: '2042-08-05', reason: 'Overlap' }, hr), 409);
    const row = body(await post(path, { startsOn: '2042-08-01', endsOn: '2042-08-03', reason: 'More training' }, hr), 201);
    expect(await prisma.attendanceEligibility.count({ where: { internshipId: intern.id } })).toBe(2);
    const cancelled = body(await post(path + '/' + row.id + '/cancel', { reason: 'Original dates reinstated' }, hr));
    expect(cancelled.cancelledAt).toBeTruthy();
    const current = await prisma.internship.findUniqueOrThrow({ where: { id: intern.id } });
    expect(current.expectedCompletionDate).toEqual(iso('2042-07-31'));
    await prisma.user.update({ where: { id: person.id }, data: { status: 'SUSPENDED' } });
    body(await post(path, { startsOn: '2042-08-01', endsOn: '2042-08-03', reason: 'Suspended account' }, hr), 409);
  });

  it('keeps intern designation independent from RBAC and effective only within the continuation', async () => {
    const [dept, hr] = await Promise.all([department(), actor('HR_MANAGER')]);
    const { intern, person } = await enrollment(dept);
    const extension = body(await post(periodPath(intern, '/extensions'),
      { startsOn: '2042-07-15', durationDays: 10, reason: 'Continuation' }, hr), 201);
    const base = periodPath(intern, '/promotions');
    body(await post(base, { designation: 'Senior Intern', effectiveOn: '2042-07-16', reason: 'Merit',
      continuationId: extension.continuation.id, role: 'TEAM_LEADER' }, hr), 400);
    body(await post(base, { designation: 'Senior Intern', effectiveOn: '2042-07-16', reason: 'Merit',
      continuationId: extension.continuation.id }, hr), 201);
    expect(body(await get('/internships/me', person)).items[0].effectiveDesignation).toBe('Intern');
    vi.setSystemTime(new Date('2042-07-15T18:30:00Z'));
    const items = body(await get('/internships/me', person)).items;
    expect(items.map((row) => row.effectiveDesignation)).toEqual(['Senior Intern', 'Intern']);
    expect(await prisma.userRole.count({ where: { userId: person.id, role: { code: 'INTERN' } } })).toBe(1);
    expect(await prisma.staffProfile.count({ where: { userId: person.id } })).toBe(0);
  });

  it('requires a distinct HR recommender and recently authenticated primary Founder for atomic staff activation', async () => {
    const [dept, hr, coFounder] = await Promise.all([department(), actor('HR_MANAGER'), actor('CO_FOUNDER')]);
    const { intern, person } = await enrollment(dept);
    const path = periodPath(intern, '/promotions');
    const data = { designation: 'Team Lead', effectiveOn: '2042-07-16', reason: 'Staff recommendation',
      targetRole: 'TEAM_LEADER', departmentId: dept.id };
    const attempts = await Promise.all([post(path, data, hr), post(path, data, hr)]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([201, 409]);
    const row = body(attempts.find(({ status }) => status === 201), 201);
    const target = '/promotions/' + row.id;
    body(await post(target + '/approve', { reason: 'No' }, hr), 403);
    body(await post(target + '/approve', { reason: 'No' }, coFounder), 403);
    identities.set('founder', { ...founderFixture, stale: true });
    expect((await post(target + '/approve', { reason: 'Trying old session' })).body.error.code).toBe('RECENT_AUTHENTICATION_REQUIRED');
    identities.set('founder', founderFixture);
    expect(body(await post(target + '/approve', { reason: 'Reviewed' })).status).toBe('APPROVED');
    body(await post(target + '/provision'), 409);
    expect(await prisma.staffProfile.count({ where: { userId: person.id } })).toBe(0);
    vi.setSystemTime(new Date('2042-07-16T01:00:00Z'));
    const result = body(await post(target + '/provision'));
    expect(result.status).toBe('PROVISIONED');
    expect(await prisma.staffProfile.count({ where: { id: result.provisionedStaffId, userId: person.id } })).toBe(1);
    expect(await prisma.userRole.count({ where: { userId: person.id, role: { code: 'TEAM_LEADER' } } })).toBe(1);
    expect(await prisma.userDepartment.count({ where: { userId: person.id, departmentId: dept.id, assignedRole: 'TEAM_LEADER' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { resourceId: row.id, action: 'STAFF_PROMOTION_PROVISIONED' } })).toBe(1);
    expect((await prisma.internship.findUniqueOrThrow({ where: { id: intern.id } })).internshipStatus).toBe('COMPLETED');
  });

  it('records rejection and cancellation and denies self-approved staff recommendations', async () => {
    const [dept, hr] = await Promise.all([department(), actor('HR_MANAGER')]);
    const { intern } = await enrollment(dept);
    const path = periodPath(intern, '/promotions');
    const data = { designation: 'Operations', effectiveOn: '2042-07-16', reason: 'Recommendation',
      targetRole: 'OPERATIONS_EXECUTIVE', departmentId: dept.id };
    const first = body(await post(path, data), 201);
    body(await post('/promotions/' + first.id + '/approve', { reason: 'Self approval' }), 403);
    body(await post('/promotions/' + first.id + '/cancel', { reason: 'Withdraw recommendation' }));
    const second = body(await post(path, data, hr), 201);
    expect(body(await post('/promotions/' + second.id + '/reject', { reason: 'Not approved' })).status).toBe('REJECTED');
  });

  it('schedules deduplicated manual invitations with scoped responses, reminders, rescheduling and cancellation', async () => {
    const [first, second, pending] = await Promise.all([actor(), actor(), actor('INTERN', 'PENDING')]);
    body(await post('/meetings', meeting({ selectedUserIds: [first.id], meetingUrl: 'https://meet.google.com@other.test/abc-defg-hij' })), 400);
    body(await post('/meetings', meeting({ selectedUserIds: [first.id], endAt: '2042-07-14T08:59:00Z' })), 400);
    const invalid = body(await post('/meetings', meeting({ selectedUserIds: [pending.id] })), 201);
    body(await post(meetingPath(invalid.id, 'preview-audience')), 409);
    const draft = body(await post('/meetings', meeting({ selectedUserIds: [first.id, first.id] })), 201);
    body(await post(meetingPath(draft.id, 'schedule'), { expectedVersion: 0, previewToken: 'a'.repeat(64) }), 409);
    const scheduled = await schedule(draft);
    expect(await prisma.meetingParticipant.count({ where: { meetingId: draft.id } })).toBe(1);
    expect(body(await get('/meetings/me', first)).items.find(({ id }) => id === draft.id)).not.toHaveProperty('meetingUrl');
    expect(body(await post(meetingPath(draft.id, 'join'), {}, first)).meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
    body(await post(meetingPath(draft.id, 'join'), {}, second), 404);
    body(await post(meetingPath(draft.id, 'respond'), { response: 'ACCEPTED' }, first));
    await runMeetingReminders(prisma, clock, [60]);
    await runMeetingReminders(prisma, clock, [60]);
    expect(await prisma.notification.count({ where: { eventType: 'MEETING_REMINDER', relatedResourceId: draft.id } })).toBe(1);
    const patch = { selectedUserIds: [second.id], expectedVersion: scheduled.version, endAt: '2042-07-14T09:40:00Z' };
    const preview = body(await post(meetingPath(draft.id, 'preview-audience'), patch));
    const revised = body(await post(meetingPath(draft.id, 'reschedule'), { ...patch, previewToken: preview.previewToken }));
    body(await post(meetingPath(draft.id, 'join'), {}, first), 404);
    body(await post(meetingPath(draft.id, 'join'), {}, second));
    const canceled = body(await post(meetingPath(draft.id, 'cancel'), { expectedVersion: revised.version, reason: 'Schedule changed' }));
    expect(canceled.status).toBe('CANCELLED');
    body(await post(meetingPath(draft.id, 'join'), {}, second), 404);
  });

  it('limits Team Leader scheduling and revokes management when membership is removed', async () => {
    const [dept, other] = await Promise.all([department(), department()]);
    const { user, membership } = await leader(dept);
    const { person } = await enrollment(dept, undefined, { internshipStatus: 'ONGOING' });
    const outsider = await enrollment(other, undefined, { internshipStatus: 'ONGOING' });
    body(await post('/meetings', meeting({ audienceType: 'DEPARTMENT', departmentId: other.id }), user), 403);
    body(await post('/meetings', meeting({ selectedUserIds: [outsider.person.id] }), user), 403);
    const draft = body(await post('/meetings', meeting({ audienceType: 'DEPARTMENT', departmentId: dept.id }), user), 201);
    await schedule(draft, user);
    body(await post(meetingPath(draft.id, 'join'), {}, person));
    body(await post(meetingPath(draft.id, 'join'), {}, outsider.person), 404);
    await prisma.userDepartment.update({ where: { id: membership.id }, data: { isActive: false } });
    body(await get(meetingPath(draft.id), user), 404);
    body(await post(meetingPath(draft.id, 'cancel'), { expectedVersion: 1, reason: 'Revoked manager' }, user), 404);
  });

  it('consumes OAuth state only in the initiating browser and protects the connection from credential disclosure', async () => {
    const hr = await actor('HR_MANAGER');
    const calendarId = 'oauth-fixture@example.test';
    for (const [key, value] of Object.entries({ GOOGLE_CALENDAR_ENABLED: 'true', GOOGLE_CALENDAR_EVENT_WRITES_AUTHORIZED: 'false',
      GOOGLE_CALENDAR_CLIENT_ID: 'fixture-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'fixture-secret',
      GOOGLE_CALENDAR_REDIRECT_URI: 'http://localhost:3000/api/v1/calendar/callback', GOOGLE_CALENDAR_ID: calendarId,
      GOOGLE_CALENDAR_ORGANIZER_UID: hr.firebaseUid, GOOGLE_CALENDAR_TOKEN_KEY: 'a'.repeat(64) })) vi.stubEnv(key, value);
    const scopes = 'https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendarlist.readonly';
    const network = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fixture-access',
      refresh_token: 'fixture-refresh', scope: scopes }))).mockResolvedValueOnce(new Response(JSON.stringify({
      id: calendarId, accessRole: 'owner', conferenceProperties: { allowedConferenceSolutionTypes: ['hangoutsMeet'] }
    }))).mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', network);
    body(await post('/calendar/connect', {}, 'founder').set('Host', 'localhost:3000'), 403);
    const start = await post('/calendar/connect', {}, hr).set('Host', 'localhost:3000');
    const { consentUrl: address } = body(start);
    const state = new URL(address).searchParams.get('state');
    const cookie = start.headers['set-cookie'][0].split(';')[0];
    expect(start.headers['cache-control']).toBe('no-store');
    expect(start.headers['set-cookie'][0]).toContain('HttpOnly');
    const callback = () => request(app).get('/api/v1/calendar/callback').query({ state, code: 'test-code' }).set('Host', 'localhost:3000');
    expect((await callback()).status).toBe(400);
    expect(network).not.toHaveBeenCalled();
    expect((await callback().set('Cookie', cookie)).status).toBe(303);
    expect((await callback().set('Cookie', cookie)).status).toBe(400);
    const connection = await prisma.calendarConnection.findUniqueOrThrow({ where: { organizerId_calendarId: {
      organizerId: hr.id, calendarId } } });
    expect(connection.encryptedToken).not.toContain('fixture-refresh');
    expect(body(await get('/calendar/connection', hr))).toMatchObject({ connected: true, writeAuthorized: false });
    expect(body(await get('/calendar/connection', hr))).not.toHaveProperty('encryptedToken');
    expect(body(await post('/calendar/disconnect', {}, hr))).toEqual({ connected: false, providerRevoked: true });
    const disconnected = await prisma.calendarConnection.findUniqueOrThrow({ where: { id: connection.id } });
    expect(disconnected.encryptedToken).toBeNull();
    expect(network).toHaveBeenCalledTimes(3);
  });

  it('processes Calendar retries and asynchronous readiness exactly once per lease, with safe provider statuses', async () => {
    const { uid } = founderFixture;
    for (const [key, value] of Object.entries({ GOOGLE_CALENDAR_ENABLED: 'true', GOOGLE_CALENDAR_EVENT_WRITES_AUTHORIZED: 'true',
      GOOGLE_CALENDAR_CLIENT_ID: 'synthetic-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'synthetic-secret',
      GOOGLE_CALENDAR_REDIRECT_URI: 'http://localhost:3000/api/v1/calendar/callback', GOOGLE_CALENDAR_ID: 'fixture-calendar@example.test',
      GOOGLE_CALENDAR_ORGANIZER_UID: uid, GOOGLE_CALENDAR_TOKEN_KEY: 'a'.repeat(64) })) vi.stubEnv(key, value);
    const owner = await prisma.user.findUniqueOrThrow({ where: { firebaseUid: uid } });
    await prisma.calendarConnection.upsert({ where: { organizerId_calendarId: { organizerId: owner.id, calendarId: 'fixture-calendar@example.test' } },
      create: { organizerId: owner.id, calendarId: 'fixture-calendar@example.test', encryptedToken: 'fixture-managed', scope: 'synthetic' },
      update: { encryptedToken: 'fixture-managed' } });
    const person = await actor();
    const draft = body(await post('/meetings', meeting({ selectedUserIds: [person.id], creationMode: 'GOOGLE_CALENDAR', meetingUrl: null })), 201);
    const scheduled = await schedule(draft);
    expect(scheduled.providerSyncStatus).toBe('PENDING');
    body(await post(meetingPath(draft.id, 'join'), {}, person), 409);
    const mock = vi.fn().mockRejectedValueOnce(new CalendarError('CALENDAR_PROVIDER_UNREACHABLE', true))
      .mockResolvedValueOnce({ kind: 'PENDING' }).mockResolvedValueOnce({ kind: 'READY', meetingUrl: 'https://meet.google.com/abc-defg-hij' });
    await Promise.all([processCalendarMeeting(prisma, { synchronize: mock }), processCalendarMeeting(prisma, { synchronize: mock })]);
    expect(mock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(+clock + 6000));
    await processCalendarMeeting(prisma, { synchronize: mock });
    vi.setSystemTime(new Date(+clock + 17000));
    await processCalendarMeeting(prisma, { synchronize: mock });
    expect(new Set(mock.mock.calls.map(([, item]) => item.providerEventId)).size).toBe(1);
    expect(body(await post(meetingPath(draft.id, 'join'), {}, person)).meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
    const cancelled = body(await post(meetingPath(draft.id, 'cancel'), { expectedVersion: scheduled.version, reason: 'Cancelled' }));
    expect(cancelled.providerSyncStatus).toBe('PENDING');
    await processCalendarMeeting(prisma, { synchronize: async () => { throw new CalendarError('CALENDAR_REAUTH_REQUIRED'); } });
    expect(body(await get(meetingPath(draft.id))).providerSyncStatus).toBe('SYNC_REQUIRED');
  });
});
