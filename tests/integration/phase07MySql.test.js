import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import prisma from '../../backend/src/config/database.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import { deliveryConfiguration } from '../../backend/src/integrations/email/emailConfig.js';
import { emitNotification } from '../../backend/src/modules/notifications/notificationService.js';
import { claimEmails, finishJob, processEmailJob, workerOptions } from '../../backend/src/modules/notifications/emailQueue.js';
import { publishScheduled } from '../../backend/src/modules/notifications/announcementService.js';
import { runReminders } from '../../backend/src/modules/notifications/reminderService.js';
import { founderFixture, hasIsolatedDatabase } from './testDatabase.js';

const identities = new Map([['founder', founderFixture]]);
const now = new Date('2041-02-04T14:05:00Z');
const start = new Date('2041-02-01T00:00:00Z');
const end = new Date('2041-03-01T00:00:00Z');
let rateKey = 0;
const clockAt = (value) => () => new Date(value);
const active = { emailVerified: true, status: 'ACTIVE' };
const result = (response, status = 200) => {
  expect(response.status, response.body.error?.code).toBe(status);
  return response.body.data;
};
const call = (method, path, actor = 'founder', body) => {
  const response = request(app)[method]('/api/v1' + path)
    .set('X-Forwarded-For', '203.0.113.' + rateKey)
    .set('Authorization', 'Bearer ' + (actor.firebaseUid || actor) + '.synthetic');
  return body === undefined ? response : response.send(body);
};
const get = (path, actor) => call('get', path, actor);
const post = (path, body = {}, actor) => call('post', path, actor, body);
const patch = (path, body, actor) => call('patch', path, actor, body);

async function actor(role = 'INTERN', status = 'ACTIVE') {
  const uid = randomUUID();
  const email = uid + '@example.test';
  identities.set(uid, { uid, email });
  return prisma.user.create({ data: { ...active, status, firebaseUid: uid, email,
    profile: { create: { fullName: 'Notice Fixture ' + role } },
    userRoles: { create: { role: { connect: { code: role } } } } } });
}

async function department() {
  const id = randomUUID().slice(0, 8);
  return prisma.department.create({ data: { name: 'Notice Department ' + id, code: 'P7_' + id, slug: 'p7-' + id } });
}

async function leader(dept) {
  const account = await actor('TEAM_LEADER');
  await prisma.staffProfile.create({ data: { userId: account.id, staffCode: 'P7-' + randomUUID(),
    designation: 'Mentor', joiningDate: start } });
  const membership = await prisma.userDepartment.create({ data: { userId: account.id, departmentId: dept.id, assignedRole: 'TEAM_LEADER' } });
  return { account, membership };
}

function application(account, dept, date, applicationStatus = 'DRAFT') {
  return prisma.internshipApplication.create({ data: { applicantUserId: account.id, departmentId: dept.id,
    requestedStartDate: date, requestedDuration: '1', qualification: 'Example', institution: 'Test University',
    applicationStatus, submittedAt: applicationStatus === 'APPROVED' ? date : null } });
}

async function intern(dept, options = {}) {
  const account = await actor('INTERN', options.status);
  const begin = options.start ?? start;
  const applicant = await application(account, dept, begin, 'APPROVED');
  const internship = await prisma.internship.create({ data: { userId: account.id, departmentId: dept.id,
    applicationId: applicant.id, commencementDate: begin, expectedCompletionDate: options.end ?? end,
    internshipCode: 'P7-' + randomUUID(), positionTitle: 'Fixture intern', internshipStatus: options.lifecycle ?? 'ONGOING' } });
  return { account, internship };
}

const makeJob = async (day) => {
  const when = new Date(day + 'T00:00:00Z');
  const owner = await actor('INTERN', 'PENDING');
  const dept = await department();
  const item = await application(owner, dept, when, 'APPROVED');
  const [notice] = await prisma.$transaction((tx) => emitNotification(tx, { event: 'APPLICATION_SUBMITTED',
    type: 'INTERNSHIP_APPLICATION', resourceId: item.id, recipientIds: [owner.id], version: when.toISOString(), now: when }));
  const job = await prisma.emailOutbox.findUniqueOrThrow({ where: { notificationId: notice.id } });
  return { owner, notice, job, when };
};

async function assignment(dept, owner, status = 'ASSIGNED', dueAt = new Date('2041-02-05T10:00:00Z')) {
  const issued = await prisma.user.findUniqueOrThrow({ where: { firebaseUid: founderFixture.uid } });
  const task = await prisma.task.create({ data: { departmentId: dept.id, title: 'Reminder fixture', description: '',
    instructions: 'Write a note.', deliverables: 'Note', taskCode: 'P7-' + randomUUID(), createdBy: issued.id,
    taskType: 'INDIVIDUAL', status: 'PUBLISHED', availableFrom: start, dueAt, publishedAt: start,
    maximumScore: 10, resources: [], rubric: [] } });
  return prisma.taskAssignment.create({ data: { taskId: task.id, internshipId: owner.internship.id,
    assignedTo: owner.account.id, assignedBy: issued.id, status } });
}

describe.skipIf(!hasIsolatedDatabase())('Phase 07 notifications against disposable MySQL with synthetic identity', () => {
  beforeEach(() => {
    rateKey += 1;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    vi.spyOn(firebaseService, 'verifyIdToken').mockImplementation(async (token) => {
      const item = identities.get(token.split('.')[0]);
      if (!item) throw new Error('Unknown synthetic identity.');
      return { uid: item.uid, email: item.email, email_verified: true, aud: 'intellicore-dev',
        firebase: { sign_in_provider: 'password' } };
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('writes application notices and email jobs transactionally, with deduplication and rollback', async () => {
    const [owner, hr, outsider, dept] = await Promise.all([actor('INTERN', 'PENDING'), actor('HR_MANAGER'), actor(), department()]);
    const pending = await application(owner, dept, start);
    const route = '/internship-applications/' + pending.id + '/submit';
    const concurrent = await Promise.all([post(route, {}, owner), post(route, {}, owner)]);
    expect(concurrent.map((item) => item.status).sort()).toEqual([200, 409]);
    const own = result(await get('/notifications/me', owner)).items;
    expect(own.map((entry) => entry.eventType)).toEqual(['APPLICATION_SUBMITTED']);
    expect(result(await get('/notifications/me', hr)).items.some((entry) => entry.eventType === 'APPLICATION_REVIEW_REQUIRED')).toBe(true);
    expect(result(await get('/notifications/me', outsider)).items).toEqual([]);
    const row = await prisma.internshipApplication.findUniqueOrThrow({ where: { id: pending.id } });
    const alert = { event: 'APPLICATION_SUBMITTED', type: 'INTERNSHIP_APPLICATION', resourceId: pending.id,
      recipientIds: [owner.id], version: row.submittedAt.toISOString() };
    expect(await prisma.$transaction((tx) => emitNotification(tx, alert))).toEqual([]);
    expect(await prisma.emailOutbox.count({ where: { notificationId: own[0].id } })).toBe(1);
    await expect(prisma.$transaction(async (tx) => {
      await emitNotification(tx, { ...alert, version: 'rollback-probe' });
      throw new Error('Rollback fixture.');
    })).rejects.toThrow('Rollback fixture.');
    expect(await prisma.notification.count({ where: { recipientUserId: owner.id } })).toBe(1);
    expect(await prisma.emailOutbox.count({ where: { recipientUserId: owner.id } })).toBe(1);
  });

  it('keeps notification reads, archives, counts, filters and preferences scoped to the signed-in recipient', async () => {
    const [owner, outsider, pending] = await Promise.all([actor(), actor(), actor('INTERN', 'PENDING')]);
    const created = await prisma.$transaction((tx) => emitNotification(tx, { event: 'TASK_ASSIGNED', type: 'TASK_ASSIGNMENT',
      resourceId: randomUUID(), recipientIds: [owner.id, pending.id] }));
    expect(created.map((row) => row.recipientUserId)).toEqual([owner.id]);
    const path = '/notifications/' + created[0].id;
    expect((await get(path, outsider)).status).toBe(404);
    expect((await post(path + '/read', {}, outsider)).status).toBe(404);
    expect(result(await get('/notifications/me/unread-count', owner)).count).toBe(1);
    expect(result(await get('/notifications/me?state=UNREAD&category=TASK&limit=1', owner)).pagination.total).toBe(1);
    const read = result(await post(path + '/read', {}, owner));
    expect(result(await post(path + '/read', {}, owner)).readAt).toBe(read.readAt);
    expect(result(await post('/notifications/me/read-all', {}, owner)).count).toBe(0);
    result(await post(path + '/archive', {}, owner));
    expect(result(await get('/notifications/me', owner)).items).toEqual([]);
    expect(result(await get('/notifications/me?state=ARCHIVED', owner)).items).toHaveLength(1);
    expect(result(await patch('/notification-preferences/me', { emailEnabled: false }, owner)).emailEnabled).toBe(false);
    expect((await patch('/notification-preferences/me', { emailEnabled: false }, pending)).status).toBe(403);
    expect((await patch('/notification-preferences/me', { recipientUserId: outsider.id }, owner)).status).toBe(400);
  });

  it('claims a job once across concurrent workers and records local capture without sending', async () => {
    const { job, when } = await makeJob('1901-01-06');
    const [first, second] = await Promise.all([claimEmails(prisma, randomUUID(), when), claimEmails(prisma, randomUUID(), when)]);
    const matches = [...first, ...second].filter(({ id }) => id === job.id);
    expect(matches).toHaveLength(1);
    const transport = vi.fn();
    expect(await processEmailJob(prisma, matches[0], deliveryConfiguration({}), workerOptions({}), {
      clock: clockAt(when), createTransport: transport
    })).toEqual({ status: 'CAPTURED' });
    expect(transport).not.toHaveBeenCalled();
    const path = '/admin/email-outbox/' + job.id;
    const captured = result(await get(path));
    expect(captured).toMatchObject({ sentAt: null, status: 'CAPTURED', attemptCount: 1,
      preview: { subject: expect.stringContaining('Internship application received') } });
    expect(captured.recipientEmail).toBeUndefined();
    expect(result(await get(path + '/attempts')).items[0].outcome).toBe('CAPTURED');
    expect((await get(path, await actor('HR_MANAGER'))).status).toBe(403);
  });

  it('recovers a lease after a restart and stops automatic retries when acceptance may be ambiguous', async () => {
    const { job, when } = await makeJob('1901-01-05');
    const first = (await claimEmails(prisma, randomUUID(), when)).find(({ id }) => id === job.id);
    const later = new Date(+when + 61_000);
    const recovered = (await claimEmails(prisma, randomUUID(), later)).find(({ id }) => id === job.id);
    expect(recovered.attemptCount).toBe(2);
    expect(await finishJob(prisma, first, { status: 'CAPTURED' }, later, workerOptions({}))).toBe(false);
    await prisma.emailDeliveryAttempt.update({ where: { emailOutboxId_sequence: { emailOutboxId: job.id, sequence: 2 } },
      data: { outcome: 'DELIVERING' } });
    const third = await claimEmails(prisma, randomUUID(), new Date(+later + 61_000));
    expect(third.some(({ id }) => id === job.id)).toBe(false);
    const state = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: job.id } });
    expect(state).toMatchObject({ status: 'FAILED', lastErrorCode: 'DELIVERY_AMBIGUOUS' });
    expect((await post('/admin/email-outbox/' + job.id + '/retry', { confirm: true })).status).toBe(409);
    expect((await post('/admin/email-outbox/' + job.id + '/retry', { confirm: true, confirmAmbiguous: true },
      await actor('ADMIN'))).status).toBe(403);
    expect(result(await post('/admin/email-outbox/' + job.id + '/retry', { confirm: true, confirmAmbiguous: true })).status)
      .toBe('RETRY_SCHEDULED');
  });

  it('persists bounded retry scheduling, exhaustion and disabled queue handling', async () => {
    const { job, when } = await makeJob('1901-01-04');
    await prisma.emailOutbox.update({ where: { id: job.id }, data: { maximumAttempts: 2 } });
    const first = (await claimEmails(prisma, randomUUID(), when)).find(({ id }) => id === job.id);
    const temporary = { status: 'RETRY_SCHEDULED', errorCode: 'SMTP_TEMPORARY' };
    await finishJob(prisma, first, temporary, when, workerOptions({}), () => 1);
    const scheduled = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: job.id } });
    expect(scheduled).toMatchObject({ status: 'RETRY_SCHEDULED', nextAttemptAt: new Date(+when + 60_000) });
    const next = (await claimEmails(prisma, randomUUID(), scheduled.nextAttemptAt)).find(({ id }) => id === job.id);
    await finishJob(prisma, next, temporary, scheduled.nextAttemptAt, workerOptions({}));
    expect(await prisma.emailOutbox.findUniqueOrThrow({ where: { id: job.id } }))
      .toMatchObject({ status: 'FAILED', lastErrorCode: 'RETRY_EXHAUSTED' });
    const disabled = await makeJob('1901-01-03');
    const claimed = (await claimEmails(prisma, randomUUID(), disabled.when)).find(({ id }) => id === disabled.job.id);
    await processEmailJob(prisma, claimed, { mode: 'DISABLED' }, workerOptions({}), { clock: clockAt(disabled.when) });
    expect(await prisma.emailOutbox.findUniqueOrThrow({ where: { id: disabled.job.id } }))
      .toMatchObject({ status: 'CANCELLED', lastErrorCode: 'DELIVERY_DISABLED' });
  });

  it('revalidates current email preference, address and account eligibility immediately before delivery', async () => {
    const { job, owner, when } = await makeJob('1901-01-02');
    const claim = (await claimEmails(prisma, randomUUID(), when)).find(({ id }) => id === job.id);
    await prisma.notificationPreference.create({ data: { userId: owner.id, emailEnabled: false } });
    const outcome = await processEmailJob(prisma, claim, deliveryConfiguration({}), workerOptions({}), { clock: clockAt(when) });
    expect(outcome).toEqual({ status: 'CANCELLED', errorCode: 'RECIPIENT_NO_LONGER_ELIGIBLE' });
  });

  it('limits department announcement authors and recipients and deduplicates publication', async () => {
    const [dept, other] = await Promise.all([department(), department()]);
    const [activeIntern, foreignIntern, mentor] = await Promise.all([intern(dept), intern(other), leader(dept)]);
    const fields = { title: 'Scoped announcement', message: 'Department update.', audienceType: 'DEPARTMENT', departmentId: dept.id };
    expect((await post('/announcements', { title: fields.title, message: fields.message, audienceType: 'ALL_ACTIVE_USERS' },
      mentor.account)).status).toBe(403);
    expect((await post('/announcements', { ...fields, departmentId: other.id }, mentor.account)).status).toBe(403);
    const draft = result(await post('/announcements', fields, mentor.account), 201);
    const path = '/announcements/' + draft.id;
    const preview = result(await post(path + '/preview-audience', {}, mentor.account));
    expect(preview.count).toBe(2);
    const body = { expectedRevision: preview.revision, previewToken: preview.previewToken };
    const responses = await Promise.all([post(path + '/publish', body, mentor.account), post(path + '/publish', body, mentor.account)]);
    expect(responses.map((row) => row.status).sort()).toEqual([200, 409]);
    expect(result(await get('/announcements/me/' + draft.id, activeIntern.account)).title).toBe(fields.title);
    expect((await get('/announcements/me/' + draft.id, foreignIntern.account)).status).toBe(404);
    expect(await prisma.emailOutbox.count({ where: { notification: { relatedResourceId: draft.id } } })).toBe(0);
    await prisma.userDepartment.update({ where: { id: mentor.membership.id }, data: { isActive: false } });
    expect((await get('/announcements/me/' + draft.id, mentor.account)).status).toBe(404);
    expect((await get(path, mentor.account)).status).toBe(404);
  });

  it('schedules a confirmed snapshot, excludes later and revoked members, and preserves cancelled history', async () => {
    const dept = await department();
    const owner = await intern(dept);
    const leaving = await intern(dept);
    const fields = { title: 'Scheduled announcement', message: 'An approved notice.', audienceType: 'DEPARTMENT', departmentId: dept.id };
    const draft = result(await post('/announcements', fields), 201);
    const path = '/announcements/' + draft.id;
    const preview = result(await post(path + '/preview-audience'));
    const scheduledAt = '2041-02-04T14:06:00Z';
    result(await post(path + '/schedule', { scheduledAt, expectedRevision: preview.revision, previewToken: preview.previewToken }));
    const later = await intern(dept);
    await prisma.user.update({ where: { id: leaving.account.id }, data: { status: 'SUSPENDED' } });
    expect(await publishScheduled(prisma, draft.id, now)).toBeNull();
    const released = await publishScheduled(prisma, draft.id, new Date(scheduledAt));
    expect(released.recipientCount).toBe(1);
    expect(result(await get('/announcements/me/' + draft.id, owner.account)).title).toBe(fields.title);
    expect((await get('/announcements/me/' + draft.id, later.account)).status).toBe(404);
    const cancelled = result(await post('/announcements', { ...fields, title: 'Cancelled before publication' }), 201);
    expect(result(await post('/announcements/' + cancelled.id + '/cancel', { confirm: true })).status).toBe('CANCELLED');
    expect(await prisma.announcementRecipient.count({ where: { announcementId: cancelled.id } })).toBe(0);
  });

  it('runs IST reminder windows with durable deduplication and excludes leave, weekly off and completed assignments', async () => {
    const dept = await department();
    const [eligible, onLeave, completed] = await Promise.all([intern(dept), intern(dept), intern(dept)]);
    for (const { internship } of [eligible, onLeave, completed]) {
      await prisma.attendanceEligibility.create({ data: { internshipId: internship.id, startsAt: start, firstDate: start, lastDate: end } });
    }
    const day = new Date('2041-02-04');
    await prisma.leaveRequest.create({ data: { internshipId: onLeave.internship.id, leaveType: 'CASUAL_LEAVE', startDate: day,
      endDate: day, workingDays: 1, reason: 'Fixture leave', status: 'APPROVED' } });
    const activeTask = await assignment(dept, eligible);
    const doneTask = await assignment(dept, completed, 'COMPLETED');
    const options = { taskHours: 24, reportMinutes: 60, commencementDays: 0, completionDays: 0 };
    await runReminders(prisma, now, {}, options, 100);
    await runReminders(prisma, now, {}, options, 100);
    expect(await prisma.notification.count({ where: { relatedResourceId: activeTask.id, eventType: 'TASK_DEADLINE_REMINDER' } })).toBe(1);
    expect(await prisma.notification.count({ where: { relatedResourceId: doneTask.id, eventType: 'TASK_DEADLINE_REMINDER' } })).toBe(0);
    expect(await prisma.notification.count({ where: { recipientUserId: eligible.account.id, eventType: 'REPORT_REMINDER' } })).toBe(1);
    expect(await prisma.notification.count({ where: { recipientUserId: onLeave.account.id, eventType: 'REPORT_REMINDER' } })).toBe(0);
    for (const quiet of ['2041-02-09T14:05:00Z', '2041-02-05T17:00:00Z']) {
      await runReminders(prisma, new Date(quiet), {}, options, 100);
    }
    expect(await prisma.notification.count({ where: { recipientUserId: eligible.account.id, eventType: 'REPORT_REMINDER' } })).toBe(1);
  });

  it('preserves the original task review when an authorized reviewer amends its score', async () => {
    const dept = await department();
    const owner = await intern(dept);
    const row = await assignment(dept, owner, 'COMPLETED');
    const reviewer = await prisma.user.findUniqueOrThrow({ where: { firebaseUid: founderFixture.uid } });
    const submission = await prisma.taskSubmission.create({ data: { assignmentId: row.id, submittedBy: owner.account.id,
      submissionVersion: 1, writtenResponse: 'Fixture work', additionalLinks: [], status: 'SUBMITTED', submittedAt: now,
      taskSnapshot: { maximumScore: 10, rubric: [] } } });
    const review = await prisma.taskReview.create({ data: { submissionId: submission.id, reviewedBy: reviewer.id,
      decision: 'APPROVED', score: 6, maximumScore: 10, feedback: 'Reviewed fixture.', criterionScores: [] } });
    const path = '/task-submissions/' + submission.id + '/review/amend';
    const body = { expectedRevision: 0, reason: 'Corrected the recorded arithmetic.', score: 8 };
    expect((await post(path, body, owner.account)).status).toBe(403);
    expect((await post(path, { ...body, score: 11 })).status).toBe(400);
    expect(result(await post(path, body), 201)).toMatchObject({ score: 8, revision: 1 });
    expect((await post(path, body)).status).toBe(409);
    expect((await prisma.taskReview.findUniqueOrThrow({ where: { id: review.id } })).score).toBe(6);
    expect(result(await get('/performance/me', owner.account)).evaluations.items[0]).toMatchObject({ score: 8, originalScore: 6 });
  });

  it('records a scoped lesson correction, retains original timestamps and recalculates enrollment progress', async () => {
    const dept = await department();
    const owner = await intern(dept);
    const reviewer = await prisma.user.findUniqueOrThrow({ where: { firebaseUid: founderFixture.uid } });
    const track = await prisma.learningTrack.create({ data: { departmentId: dept.id, title: 'Progress fixture', description: '',
      trackKey: randomUUID(), status: 'PUBLISHED', publishedAt: start, createdBy: reviewer.id,
      modules: { create: { title: 'Module', description: '', sequence: 1,
        lessons: { create: { title: 'Lesson', content: 'Fixture exercise', sequence: 1 } } } } },
    include: { modules: { include: { lessons: true } } } });
    const lesson = track.modules[0].lessons[0];
    const enrollment = await prisma.learningEnrollment.create({ data: { internshipId: owner.internship.id,
      learningTrackId: track.id, curriculumVersion: 1, status: 'COMPLETED' } });
    const progress = await prisma.learningProgress.create({ data: { lessonId: lesson.id, learningEnrollmentId: enrollment.id,
      startedAt: start, completedAt: now, status: 'COMPLETED' } });
    const path = '/learning/enrollments/' + enrollment.id + '/lessons/' + lesson.id + '/correct';
    const body = { expectedStatus: 'COMPLETED', status: 'IN_PROGRESS', expectedCorrectionId: null,
      reason: 'Completion was recorded incorrectly.' };
    expect((await post(path, body, owner.account)).status).toBe(403);
    expect(result(await post(path, body), 201)).toMatchObject({ status: 'IN_PROGRESS', enrollmentStatus: 'ACTIVE' });
    expect((await post(path, body)).status).toBe(409);
    const original = await prisma.learningProgressCorrection.findFirstOrThrow({ where: { progressId: progress.id } });
    expect(original.beforeState).toMatchObject({ status: 'COMPLETED', completedAt: now.toISOString() });
    expect(result(await get('/learning/me/enrollments/' + enrollment.id, owner.account)).learning.percentage).toBe(0);
  });
});
