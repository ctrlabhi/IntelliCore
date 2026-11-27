
import { randomUUID } from 'node:crypto';
import { rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import prisma from '../../backend/src/config/database.js';
import env from '../../backend/src/config/env.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import storage from '../../backend/src/integrations/storage/storageService.js';
import auditService from '../../backend/src/modules/audit/auditService.js';
import { bootstrapFounder } from '../../backend/src/scripts/bootstrapFounder.js';
import { founderFixture, hasIsolatedDatabase } from './testDatabase.js';

const identities = new Map([['founder', founderFixture]]);
const taskFields = { title: 'Working prototype', description: 'Synthetic exercise', instructions: 'Provide a short rationale.',
  deliverables: 'Write-up and evidence', taskType: 'INDIVIDUAL', availableFrom: '2034-02-05T06:00:00Z',
  dueAt: '2034-02-06T06:00:00Z', maximumScore: 10, rubric: [{ criterion: 'Accuracy', points: 10 }] };
const review = { decision: 'APPROVED', feedback: 'The revised work meets requirements.', criterionScores: [9] };
const confirmation = { confirmActiveChange: true };
const draftFiles = [];
let rateKey = 0;
const http = (method, path, actor = 'founder') => request(app)[method]('/api/v1' + path)
  .set('Authorization', 'Bearer ' + (actor.firebaseUid || actor) + '.fixture.token')
  .set('X-Forwarded-For', '198.51.100.' + rateKey);
const post = (path, body = {}, actor) => http('post', path, actor).send(body);
const patch = (path, body, actor) => http('patch', path, actor).send(body);
const get = (path, actor) => http('get', path, actor);
const when = (iso) => vi.setSystemTime(new Date(iso));

function data(response, status = 200) {
  expect(response.status, response.body.error?.code).toBe(status);
  return response.body.data;
}

async function department() {
  const code = randomUUID().replaceAll('-', '').slice(0, 12);
  return prisma.department.create({ data: { name: 'Test Department ' + code, code: 'FIX_' + code, slug: 'fix-' + code } });
}

async function actor(role, status = 'ACTIVE', verified = true) {
  const uid = randomUUID();
  const email = uid + '@example.test';
  identities.set(uid, { uid, email, verified });
  return prisma.user.create({ data: { firebaseUid: uid, email, emailVerified: verified, status,
    profile: { create: { fullName: 'Phase Six ' + role } }, userRoles: { create: { role: { connect: { code: role } } } } } });
}

async function intern(dept, options = {}) {
  const account = await actor('INTERN', options.status, options.verified);
  const start = new Date(options.start ?? '2034-02-05');
  const application = await prisma.internshipApplication.create({ data: {
    applicantUserId: account.id, departmentId: dept.id, applicationStatus: 'APPROVED',
    requestedStartDate: start, requestedDuration: '1', qualification: 'Synthetic diploma', institution: 'Test University'
  } });
  const internship = await prisma.internship.create({ data: { internshipCode: 'FIX06-' + randomUUID(), userId: account.id,
    applicationId: application.id, departmentId: dept.id, positionTitle: 'Phase Six intern', commencementDate: start,
    expectedCompletionDate: new Date('2034-03-05'), internshipStatus: options.internshipStatus ?? 'APPROVED' } });
  return { account, internship };
}

async function mentor(dept) {
  const account = await actor('TEAM_LEADER');
  await prisma.staffProfile.create({ data: { userId: account.id, staffCode: 'FIX06-' + randomUUID(),
    designation: 'Mentor', joiningDate: new Date('2034-02-05'), employmentStatus: 'ACTIVE' } });
  const relation = await prisma.userDepartment.create({ data: {
    userId: account.id, departmentId: dept.id, assignedRole: 'TEAM_LEADER'
  } });
  return { account, relation };
}

async function createTask(dept, overrides = {}, who) {
  return data(await post('/tasks', { ...taskFields, ...overrides, departmentId: dept.id }, who), 201);
}

async function preview(task, recipients, who) {
  const result = data(await post('/tasks/' + task.id + '/preview', { recipients }, who));
  return { recipients, expectedRevision: result.revision, previewToken: result.previewToken, ...confirmation };
}

async function publish(task, recipients, who) {
  return data(await post('/tasks/' + task.id + '/publish', await preview(task, recipients, who), who));
}

async function assigned(dept, owner, overrides) {
  const task = await createTask(dept, overrides);
  await publish(task, [{ internshipId: owner.internship.id }]);
  const assignment = await prisma.taskAssignment.findFirstOrThrow({ where: { taskId: task.id } });
  return { task, assignment, path: '/task-assignments/' + assignment.id };
}

async function prepared(dept, owner, overrides) {
  const work = await assigned(dept, owner, overrides);
  data(await post(work.path + '/start', {}, owner.account));
  const draft = data(await post(work.path + '/submissions', {}, owner.account), 201);
  return { ...work, draft, draftPath: '/task-submissions/' + draft.id };
}

async function submit(work, owner) {
  const saved = data(await patch(work.draftPath, { writtenResponse: 'Synthetic written work.',
    projectUrl: 'https://example.test/project', repositoryUrl: 'https://github.com/example/project',
    expectedRevision: work.draft.revision }, owner.account));
  return data(await post(work.draftPath + '/submit', { expectedRevision: saved.revision }, owner.account));
}

function upload(path, expectedRevision, actor, bytes, filename = 'report.txt') {
  return http('post', path + '/attachments', actor).set('Content-Type', 'application/octet-stream')
    .set('X-Attachment-Name', filename).set('X-Expected-Revision', String(expectedRevision)).send(bytes);
}

function track(dept, title = 'Synthetic learning', who) {
  return post('/learning/tracks', { title, departmentId: dept.id }, who);
}
const curriculum = (id) => '/learning/tracks/' + id;

async function course(dept, { optional = false, empty = false } = {}) {
  const created = data(await track(dept), 201);
  const path = curriculum(created.id);
  const module = data(await post(path + '/modules', { title: 'Orientation', sequence: 1 }), 201);
  const lessonPath = path + '/modules/' + module.id + '/lessons';
  const lesson = empty ? null : data(await post(lessonPath, { title: 'Practice', content: 'Review the fixture.', sequence: 1 }), 201);
  const extra = optional ? data(await post(lessonPath, { title: 'Optional practice', content: 'Practice more.', sequence: 2,
    isRequired: false }), 201) : null;
  data(await post(path + '/publish', confirmation));
  return { created, module, lesson, extra, path, lessonPath };
}

describe.skipIf(!hasIsolatedDatabase())('Phase 06 HTTP against isolated MySQL and private storage, with synthetic identity', () => {
  beforeEach(() => {
    rateKey += 1;
    vi.useFakeTimers({ toFake: ['Date'] });
    when('2034-02-06T04:00:00Z');
    vi.spyOn(firebaseService, 'verifyIdToken').mockImplementation(async (token) => {
      const identity = identities.get(token.split('.')[0]);
      if (!identity) throw new Error('Unknown fixture.');
      return { uid: identity.uid, email: identity.email, email_verified: identity.verified ?? true, aud: 'intellicore-dev',
        firebase: { sign_in_provider: 'password' } };
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  afterAll(async () => {
    for (const id of draftFiles) {
      const row = await prisma.fileAttachment.findUnique({ where: { id }, select: { storageKey: true } });
      if (row) await storage.removePrivate(row.storageKey);
    }
    for (const directory of [join(env.UPLOAD_DIR, 'phase06'), env.UPLOAD_DIR]) {
      await rmdir(directory).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  });

  it('publishes selected individual recipients and makes concurrent duplicate assignment a conflict', async () => {
    const dept = await department();
    const [first, second, third] = await Promise.all([intern(dept), intern(dept), intern(dept)]);
    const task = await createTask(dept);
    expect(data(await get('/tasks/' + task.id)).status).toBe('DRAFT');
    const invalidTime = await patch('/tasks/' + task.id, { expectedRevision: task.revision, dueAt: '2034-02-04T06:00:00Z' });
    expect(invalidTime.status).toBe(400);
    const result = await publish(task, [{ internshipId: first.internship.id }, { internshipId: second.internship.id }]);
    expect(result.assignedCount).toBe(2);
    const options = await preview(task, [{ internshipId: third.internship.id }]);
    const path = '/tasks/' + task.id + '/assignments';
    const concurrent = await Promise.all([post(path, options), post(path, options)]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.taskAssignment.count({ where: { taskId: task.id } })).toBe(3);
    expect((await patch('/tasks/' + task.id, { expectedRevision: task.revision, instructions: 'stale change' })).status).toBe(409);
    expect((await patch('/tasks/' + task.id, { expectedRevision: result.task.revision, instructions: 'missing confirmation' })).status).toBe(409);
  });

  it('snapshots the eligible department set and rejects stale previews, duplicate selections and invalid recipients', async () => {
    const dept = await department();
    const other = await department();
    const first = await intern(dept);
    const task = await createTask(dept, { taskType: 'DEPARTMENT' });
    const options = await preview(task, []);
    const [second, cross, pending, suspended, future, complete, terminated] = await Promise.all([
      intern(dept), intern(other), intern(dept, { status: 'PENDING' }), intern(dept, { status: 'SUSPENDED' }),
      intern(dept, { start: '2034-02-07' }), intern(dept, { internshipStatus: 'COMPLETED' }),
      intern(dept, { internshipStatus: 'TERMINATED' })
    ]);
    expect((await post('/tasks/' + task.id + '/publish', options)).body.error.code).toBe('STALE_RECIPIENT_PREVIEW');
    expect((await publish(task, [])).assignedCount).toBe(2);
    const later = await intern(dept);
    const rows = await prisma.taskAssignment.findMany({ where: { taskId: task.id } });
    expect(rows.map((item) => item.internshipId).sort()).toEqual([first.internship.id, second.internship.id].sort());
    expect(rows.some((row) => row.internshipId === later.internship.id)).toBe(false);
    const individual = await createTask(dept);
    for (const entry of [cross, pending, suspended, future, complete, terminated]) {
      expect((await post('/tasks/' + individual.id + '/preview', { recipients: [{ internshipId: entry.internship.id }] })).status).toBe(409);
    }
    const duplicate = { recipients: [{ internshipId: first.internship.id }, { internshipId: first.internship.id }] };
    expect((await post('/tasks/' + individual.id + '/preview', duplicate)).status).toBe(400);
  });

  it('keeps future work locked, closes without approval, and archives without deleting history', async () => {
    const dept = await department();
    const owner = await intern(dept);
    const { task, assignment, path } = await assigned(dept, owner, { availableFrom: '2034-02-06T05:00:00Z' });
    const upcoming = data(await get(path, owner.account));
    expect(upcoming.task.instructions).toBeUndefined();
    expect((await post(path + '/start', {}, owner.account)).status).toBe(409);
    expect((await post('/tasks/' + task.id + '/archive', confirmation)).status).toBe(409);
    data(await post('/tasks/' + task.id + '/close', confirmation));
    data(await post('/tasks/' + task.id + '/archive', confirmation));
    expect((await prisma.taskAssignment.findUnique({ where: { id: assignment.id } })).status).toBe('ASSIGNED');
    expect((await post('/tasks/' + task.id + '/publish', {})).status).toBe(409);
    expect(data(await get('/tasks/' + task.id)).status).toBe('ARCHIVED');
  });

  it('keeps overdue separate, accepts late work and snapshots task and individual deadlines', async () => {
    const dept = await department();
    const owner = await intern(dept);
    const work = await prepared(dept, owner);
    when('2034-02-06T06:01:00Z');
    expect(data(await get(work.path, owner.account)).overdue).toBe(true);
    const submitted = await submit(work, owner);
    expect(submitted).toMatchObject({ late: true, deadlineAt: '2034-02-06T06:00:00.000Z', status: 'SUBMITTED' });
    expect(data(await get(work.path, owner.account))).toMatchObject({ overdue: false, status: 'SUBMITTED' });
    const after = data(await patch('/tasks/' + work.task.id, {
      expectedRevision: 2, ...confirmation, dueAt: '2034-02-07T06:00:00Z', instructions: 'Update assignment guidance.'
    }));
    expect(after.revision).toBe(3);
    expect(data(await get(work.draftPath, owner.account)).taskSnapshot.instructions).toBe(taskFields.instructions);
    expect(data(await get(work.draftPath, owner.account)).deadlineAt).toBe(submitted.deadlineAt);
    const other = await intern(dept);
    const separate = await assigned(dept, other, { dueAt: '2034-02-08T06:00:00Z' });
    data(await post(separate.path + '/extend', { ...confirmation, dueAt: '2034-02-09T06:00:00Z' }));
    expect(data(await get(separate.path, other.account)).effectiveDueAt).toBe('2034-02-09T06:00:00.000Z');
    expect(await prisma.auditLog.count({ where: { action: 'TASK_ASSIGNMENT_DEADLINE_CHANGED', resourceId: separate.assignment.id } })).toBe(1);
    expect(data(await post(separate.path + '/cancel', { ...confirmation, reason: 'Recipient schedule changed.' })).status).toBe('CANCELLED');
    expect(data(await get('/tasks/' + separate.task.id)).status).toBe('PUBLISHED');
  });

  it('serializes concurrent drafts and submits, rejects unsafe links and does not produce Phase 05 records', async () => {
    const dept = await department();
    const owner = await intern(dept);
    const work = await assigned(dept, owner);
    expect((await post(work.path + '/submissions', {}, owner.account)).status).toBe(409);
    data(await post(work.path + '/start', {}, owner.account));
    const [first, second] = await Promise.all([post(work.path + '/submissions', {}, owner.account),
      post(work.path + '/submissions', {}, owner.account)]);
    const draft = data(first, 201);
    expect(data(second, 201).id).toBe(draft.id);
    const path = '/task-submissions/' + draft.id;
    expect((await patch(path, { projectUrl: 'javascript:alert(1)', expectedRevision: draft.revision }, owner.account)).status).toBe(400);
    expect((await post(path + '/submit', { expectedRevision: draft.revision }, owner.account)).status).toBe(400);
    const saved = data(await patch(path, { projectUrl: 'https://example.test/demo', expectedRevision: draft.revision }, owner.account));
    const result = await Promise.all([post(path + '/submit', { expectedRevision: saved.revision }, owner.account),
      post(path + '/submit', { expectedRevision: saved.revision }, owner.account)]);
    expect(result.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await prisma.taskSubmission.count({ where: { assignmentId: work.assignment.id } })).toBe(1);
    expect(await prisma.attendance.count({ where: { internshipId: owner.internship.id } })).toBe(0);
    expect(await prisma.dailyWorkReport.count({ where: { internshipId: owner.internship.id } })).toBe(0);
  });

  it('stores private files, validates file bytes, and protects upload and download at resource scope', async () => {
    const dept = await department();
    const [owner, stranger, otherDepartment] = await Promise.all([intern(dept), intern(dept), department()]);
    const [lead, unrelated, hr] = await Promise.all([mentor(dept), mentor(otherDepartment), actor('HR_MANAGER')]);
    const task = await createTask(dept);
    const reference = data(await upload('/tasks/' + task.id, task.revision, 'founder', Buffer.from('Reference notes.')), 201);
    draftFiles.push(reference.id);
    await publish(task, [{ internshipId: owner.internship.id }]);
    expect((await get('/attachments/' + reference.id + '/download', owner.account)).text).toBe('Reference notes.');
    expect((await get('/attachments/' + reference.id + '/download', stranger.account)).status).toBe(404);
    const work = await prepared(dept, owner);
    const body = Buffer.from('Private original text.');
    expect((await upload(work.draftPath, work.draft.revision, owner.account, body, '..%2Freport.txt')).status).toBe(400);
    expect((await upload(work.draftPath, work.draft.revision, owner.account, body, 'fake.png')).status).toBe(415);
    expect((await upload(work.draftPath, work.draft.revision, owner.account, Buffer.alloc(5 * 1024 * 1024 + 1, 'x'))).status).toBe(413);
    expect((await upload(work.draftPath, work.draft.revision, stranger.account, body)).status).toBe(404);
    const file = data(await upload(work.draftPath, work.draft.revision, owner.account, body), 201);
    draftFiles.push(file.id);
    expect(file.storageKey).toBeUndefined();
    const path = '/attachments/' + file.id + '/download';
    expect((await get(path, lead.account)).status).toBe(404);
    data(await post(work.draftPath + '/submit', { expectedRevision: file.revision }, owner.account));
    const download = await get(path, lead.account);
    expect(download.status).toBe(200);
    expect(download.text).toBe(body.toString());
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(download.headers['content-disposition']).toContain('attachment');
    for (const account of [unrelated.account, stranger.account]) expect((await get(path, account)).status).toBe(404);
    expect((await get(path, hr)).status).toBe(403);
    expect((await get(work.draftPath, hr)).status).toBe(403);
    await prisma.userDepartment.update({ where: { id: lead.relation.id }, data: { isActive: false } });
    expect((await get(path, lead.account)).status).toBe(404);
  });

  it('rolls review and submission status back together and preserves reviewed revisions', async () => {
    const dept = await department();
    const owner = await intern(dept);
    const otherDept = await department();
    const [lead, foreign] = await Promise.all([mentor(dept), mentor(otherDept)]);
    const work = await prepared(dept, owner);
    await submit(work, owner);
    const path = work.draftPath + '/review';
    expect((await post(path, review, owner.account)).status).toBe(403);
    expect((await post(path, review, foreign.account)).status).toBe(404);
    expect((await post(path, { ...review, criterionScores: [11] }, lead.account)).status).toBe(400);
    const auditError = vi.spyOn(auditService, 'createAuditLog').mockRejectedValueOnce(new Error('Synthetic audit failure.'));
    expect((await post(path, review, lead.account)).status).toBe(500);
    auditError.mockRestore();
    expect(await prisma.taskReview.count({ where: { submissionId: work.draft.id } })).toBe(0);
    expect((await prisma.taskAssignment.findUnique({ where: { id: work.assignment.id } })).status).toBe('SUBMITTED');
    data(await post(path, { decision: 'REVISION_REQUESTED', feedback: 'Please provide more evidence.' }, lead.account), 201);
    const revised = data(await post(work.path + '/submissions', {}, owner.account), 201);
    expect(revised.submissionVersion).toBe(2);
    const revisedPath = '/task-submissions/' + revised.id;
    await submit({ draft: revised, draftPath: revisedPath }, owner);
    expect((await post(path, review, lead.account)).status).toBe(409);
    const result = await Promise.all([post(revisedPath + '/review', review, lead.account), post(revisedPath + '/review', review, lead.account)]);
    expect(result.map((response) => response.status).sort()).toEqual([201, 409]);
    const history = data(await get(work.path + '/submissions', owner.account)).items;
    expect(history.map((item) => item.review.decision)).toEqual(['APPROVED', 'REVISION_REQUESTED']);
    expect(history[1].writtenResponse).toBe('Synthetic written work.');
    expect(data(await get('/performance/me', owner.account)).summary.completionRate).toEqual({ numerator: 1, denominator: 1, percentage: 100 });
  });

  it('cancels without deleting submissions and excludes cancellations from performance denominators', async () => {
    const dept = await department();
    const owner = await intern(dept);
    const work = await prepared(dept, owner);
    await submit(work, owner);
    data(await post('/tasks/' + work.task.id + '/cancel', confirmation));
    data(await post('/tasks/' + work.task.id + '/archive', confirmation));
    expect(data(await get(work.path, owner.account)).status).toBe('CANCELLED');
    expect(data(await get(work.path + '/submissions', owner.account)).items).toHaveLength(1);
    const performance = data(await get('/performance/me', owner.account));
    expect(performance.summary.counts.CANCELLED).toBe(1);
    expect(performance.summary.completionRate).toEqual({ numerator: 0, denominator: 0, percentage: null });
    expect(performance.evaluations.items).toEqual([]);
  });

  it('keeps every recovered exercise, mapping and rubric, with an honest WordPress catalog', async () => {
    const web = await prisma.department.findUniqueOrThrow({ where: { code: 'WEB_DEV' } });
    const wordpress = await prisma.department.findUniqueOrThrow({ where: { code: 'WORDPRESS_DEV' } });
    expect(await prisma.learningTrack.count({ where: { trackKey: 'legacy-practice' } })).toBe(8);
    expect(await prisma.lesson.count({ where: { sourceKey: { not: null } } })).toBe(16);
    expect(data(await get('/tasks/templates?departmentId=' + wordpress.id))).toEqual([]);
    const [template] = data(await get('/tasks/templates?departmentId=' + web.id));
    const item = await createTask(web, { templateKey: template.templateKey });
    expect(item.title).toBe(template.title);
    expect(item.rubric).toEqual(template.rubric);
    expect(item.maximumScore).toBe(100);
  });

  it('publishes immutable curriculum versions, tracks real required and optional progress, and preserves prior enrollment', async () => {
    const dept = await department();
    const [owner, lateJoiner, outsiderDept] = await Promise.all([intern(dept), intern(dept), department()]);
    const outsider = await intern(outsiderDept);
    const { path, created, module, lesson, extra, lessonPath } = await course(dept, { optional: true });
    expect((await patch(lessonPath + '/' + lesson.id, { content: 'Rewrite published text.' })).status).toBe(409);
    const sync = await Promise.all([post('/learning/me/sync', {}, owner.account), post('/learning/me/sync', {}, owner.account)]);
    expect(sync.map((response) => data(response).result).sort()).toEqual(['ENROLLED', 'EXISTING']);
    const enrollment = data(await get('/learning/me', owner.account)).items[0];
    expect(enrollment.learning).toMatchObject({ required: 1, optional: 1, percentage: 0 });
    const lessonEndpoint = '/learning/lessons/' + lesson.id;
    expect((await post(lessonEndpoint + '/start', { enrollmentId: enrollment.id }, outsider.account)).status).toBe(404);
    expect((await post(lessonEndpoint + '/complete', { enrollmentId: enrollment.id }, owner.account)).status).toBe(409);
    data(await post(lessonEndpoint + '/start', { enrollmentId: enrollment.id }, owner.account));
    data(await post(lessonEndpoint + '/complete', { enrollmentId: enrollment.id }, owner.account));
    const progress = data(await get('/learning/me/progress', owner.account)).items[0];
    expect(progress).toMatchObject({ status: 'COMPLETED', learning: { required: 1, completedRequired: 1, optional: 1,
      completedOptional: 0, completedModules: 1, percentage: 100 } });
    const fork = data(await post(path + '/versions'), 201);
    const forkPath = curriculum(fork.id);
    const forkModule = data(await get(forkPath)).modules[0];
    const editable = forkPath + '/modules/' + forkModule.id + '/lessons/' + forkModule.lessons[0].id;
    data(await patch(editable, { content: 'Current curriculum version.' }));
    const resource = data(await post(editable + '/resources', {
      title: 'Study resource', sequence: 1, resourceUrl: 'https://example.test/resource'
    }), 201);
    expect(resource.lessonId).toBe(forkModule.lessons[0].id);
    data(await patch(forkPath + '/modules/' + forkModule.id, { sequence: 2 }));
    data(await post(forkPath + '/publish', confirmation));
    expect(data(await get(path)).status).toBe('ARCHIVED');
    expect(data(await post('/learning/me/sync', {}, owner.account)).result).toBe('EXISTING');
    expect(data(await get('/learning/me', owner.account)).items[0]).toMatchObject({ track: { id: created.id, version: 1 },
      learning: { percentage: 100, modules: [{ id: module.id }] } });
    expect(data(await post('/learning/me/sync', {}, lateJoiner.account)).result).toBe('ENROLLED');
    expect(data(await get('/learning/me', lateJoiner.account)).items[0].track.version).toBe(2);
    expect(data(await get('/learning/me', outsider.account)).items).toEqual([]);
    await prisma.internship.update({ where: { id: owner.internship.id }, data: { internshipStatus: 'COMPLETED' } });
    expect(data(await get('/learning/me', owner.account)).items).toHaveLength(1);
    expect((await post('/learning/lessons/' + extra.id + '/start', { enrollmentId: enrollment.id }, owner.account)).status).toBe(404);
  });

  it('requires authorized selection across tracks, deduplicates enrollments and leaves empty progress undefined', async () => {
    const dept = await department();
    const owner = await intern(dept);
    const unrelated = await intern(await department());
    const empty = await course(dept, { empty: true });
    await course(dept);
    expect(data(await post('/learning/me/sync', {}, owner.account)).result).toBe('SELECTION_REQUIRED');
    const path = empty.path + '/enrollments';
    expect((await post(path, { internshipId: unrelated.internship.id })).status).toBe(404);
    const [one, two] = await Promise.all([post(path, { internshipId: owner.internship.id }), post(path, { internshipId: owner.internship.id })]);
    expect(data(one, 201).id).toBe(data(two, 201).id);
    const item = data(await get('/learning/me', owner.account)).items[0];
    expect(item).toMatchObject({ status: 'ACTIVE', learning: { required: 0, completedRequired: 0, percentage: null } });
  });

  it('requires appropriate roles, active verified accounts, current internship and current department membership', async () => {
    const dept = await department();
    const elsewhere = await department();
    const [admin, co, manager, executive, operations, lead, active, suspended, pending, future] = await Promise.all([
      actor('ADMIN'), actor('CO_FOUNDER'), actor('HR_MANAGER'), actor('HR_EXECUTIVE'), actor('OPERATIONS_EXECUTIVE'),
      mentor(dept), intern(dept), intern(dept, { status: 'SUSPENDED' }), intern(dept, { status: 'PENDING' }),
      intern(dept, { start: '2034-02-07' })
    ]);
    for (const account of [admin, manager, executive, active.account, suspended.account, pending.account]) {
      expect((await post('/tasks', { ...taskFields, departmentId: dept.id }, account)).status).toBe(403);
    }
    for (const account of [co, operations, lead.account]) await createTask(dept, {}, account);
    expect((await post('/tasks', { ...taskFields, departmentId: elsewhere.id }, lead.account)).status).toBe(404);
    for (const account of [admin, manager, executive, operations, active.account]) expect((await track(dept, undefined, account)).status).toBe(403);
    expect((await track(elsewhere, undefined, lead.account)).status).toBe(404);
    expect((await get('/performance/summary', active.account)).status).toBe(403);
    expect((await get('/performance/departments/' + elsewhere.id, lead.account)).status).toBe(404);
    expect(data(await get('/performance/internships/' + active.internship.id, executive)).evaluations).toBeNull();
    expect(data(await get('/performance/internships/' + active.internship.id, manager)).evaluations.items).toEqual([]);
    expect(data(await post('/learning/me/sync', {}, future.account)).result).toBe('INELIGIBLE');
    expect((await get('/task-assignments/me', pending.account)).status).toBe(403);
    expect((await get('/learning/me', suspended.account)).status).toBe(403);
    await prisma.userDepartment.update({ where: { id: lead.relation.id }, data: { isActive: false } });
    expect((await get('/performance/departments/' + dept.id, lead.account)).status).toBe(404);
    expect((await post('/tasks', { ...taskFields, departmentId: dept.id }, lead.account)).status).toBe(404);
  });

  it('serializes concurrent Founder bootstrap and rejects a competing configured identity', async () => {
    const originalUid = env.FOUNDER_FIREBASE_UID;
    const originalEmail = env.FOUNDER_EMAIL;
    const { uid, email } = founderFixture;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(firebaseService, 'getAuth').mockReturnValue({
      getUser: async (id) => ({ email: id === uid ? email : 'competing-founder@example.test', emailVerified: true })
    });
    try {
      const same = [bootstrapFounder(), bootstrapFounder()];
      env.FOUNDER_FIREBASE_UID = 'competing-founder-fixture';
      env.FOUNDER_EMAIL = 'competing-founder@example.test';
      const [first, second, competing] = await Promise.allSettled([...same, bootstrapFounder()]);
      expect(first.status).toBe('fulfilled');
      expect(second.status).toBe('fulfilled');
      expect(first.value.id).toBe(second.value.id);
      expect(competing.reason.message).toContain('Conflicting primary founder');
      expect(await prisma.userRole.count({ where: { role: { code: 'FOUNDER' } } })).toBe(1);
    } finally {
      log.mockRestore();
      env.FOUNDER_FIREBASE_UID = originalUid;
      env.FOUNDER_EMAIL = originalEmail;
    }
  });

  it('enforces cumulative user storage quota under concurrent uploads and supports draft attachment deletion', async () => {
    const dept = await department();
    const [lead, owner, stranger] = await Promise.all([mentor(dept), intern(dept), intern(dept)]);
    const taskA = await createTask(dept, {}, lead.account);
    const taskB = await createTask(dept, {}, lead.account);

    // Fill 16 MB (4 x 4 MB valid plain-text attachments across taskA)
    const fourMb = Buffer.alloc(4 * 1024 * 1024, 'A');
    let revA = taskA.revision;
    const uploadedTaskIds = [];
    for (let i = 0; i < 4; i += 1) {
      const res = data(await upload('/tasks/' + taskA.id, revA, lead.account, fourMb, `chunk-${i}.txt`), 201);
      revA = res.revision;
      uploadedTaskIds.push(res.id);
      draftFiles.push(res.id);
    }

    // Fire 2 concurrent 3 MB uploads across taskA and taskB (16 + 3 = 19 MB ok; 19 + 3 = 22 MB > 20 MB quota)
    const threeMb = Buffer.alloc(3 * 1024 * 1024, 'B');
    const concurrent = await Promise.all([
      upload('/tasks/' + taskA.id, revA, lead.account, threeMb, 'race-a.txt'),
      upload('/tasks/' + taskB.id, taskB.revision, lead.account, threeMb, 'race-b.txt')
    ]);
    expect(concurrent.map((r) => r.status).sort()).toEqual([201, 413]);
    const rejected = concurrent.find((r) => r.status === 413);
    expect(rejected.body.error.code).toBe('STORAGE_QUOTA_EXCEEDED');
    const winner = concurrent.find((r) => r.status === 201);
    draftFiles.push(winner.body.data.id);

    const usedAfterRace = await prisma.fileAttachment.aggregate({
      _sum: { fileSize: true },
      where: { ownerUserId: lead.account.id }
    });
    expect(usedAfterRace._sum.fileSize).toBe(19 * 1024 * 1024);

    // Stranger intern (403) and unrelated department mentor (404) cannot delete lead's draft attachment
    const targetDeleteId = uploadedTaskIds[0];
    const latestTaskA = data(await get('/tasks/' + taskA.id, lead.account));
    const otherLead = await mentor(await department());
    expect((await http('delete', '/attachments/' + targetDeleteId, stranger.account)
      .set('X-Expected-Revision', String(latestTaskA.revision))).status).toBe(403);
    expect((await http('delete', '/attachments/' + targetDeleteId, otherLead.account)
      .set('X-Expected-Revision', String(latestTaskA.revision))).status).toBe(404);

    // Delete one 4 MB draft attachment and confirm quota reclamation
    const delRes = data(await http('delete', '/attachments/' + targetDeleteId, lead.account)
      .set('X-Expected-Revision', String(latestTaskA.revision)));
    expect(delRes.deletedId).toBe(targetDeleteId);
    expect((await get('/attachments/' + targetDeleteId + '/download', lead.account)).status).toBe(404);

    // Verify 3 MB upload now succeeds within reclaimed quota (15 + 3 = 18 MB <= 20 MB)
    const latestTaskB = data(await get('/tasks/' + taskB.id, lead.account));
    const afterReclaim = data(await upload('/tasks/' + taskB.id, latestTaskB.revision, lead.account, threeMb, 'after-reclaim.txt'), 201);
    draftFiles.push(afterReclaim.id);

    // Verify intern draft attachment upload -> download -> deletion, and lock after submission
    await publish(taskB, [{ internshipId: owner.internship.id }], lead.account);
    const assign = await prisma.taskAssignment.findFirstOrThrow({ where: { taskId: taskB.id } });
    data(await post('/task-assignments/' + assign.id + '/start', {}, owner.account));
    const draft = data(await post('/task-assignments/' + assign.id + '/submissions', {}, owner.account), 201);
    const draftPath = '/task-submissions/' + draft.id;
    const f1 = data(await upload(draftPath, draft.revision, owner.account, Buffer.from('Draft one'), 'draft1.txt'), 201);
    draftFiles.push(f1.id);
    expect((await get('/attachments/' + f1.id + '/download', owner.account)).text).toBe('Draft one');
    const delDraftFile = data(await http('delete', '/attachments/' + f1.id, owner.account)
      .set('X-Expected-Revision', String(f1.revision)));
    expect(delDraftFile.deletedId).toBe(f1.id);

    // Re-attach, submit, and ensure submitted attachments cannot be deleted
    const f2 = data(await upload(draftPath, delDraftFile.revision, owner.account, Buffer.from('Final evidence'), 'final.txt'), 201);
    draftFiles.push(f2.id);
    const submitted = data(await post(draftPath + '/submit', { expectedRevision: f2.revision }, owner.account));
    expect((await http('delete', '/attachments/' + f2.id, owner.account)
      .set('X-Expected-Revision', String(submitted.revision))).status).toBe(409);
  });
});
