
import { randomUUID } from 'node:crypto';
import prisma from '../../config/database.js';
import { lockUser, readPage, transaction } from '../../utils/phase04.js';
import { activeDepartment, audit, conflict, eligibleWhere, found, historicalWhere, own, person, scope, can } from '../work/workAccess.js';
import { emitForReviewers, emitNotification } from '../notifications/notificationService.js';
import { ForbiddenError } from '../../utils/errors.js';

const orderBy = [{ sequence: 'asc' }, { id: 'asc' }];
const outline = { orderBy, include: { resources: { orderBy }, lessons: { orderBy, include: { resources: { orderBy } } } } };
const department = { select: { id: true, code: true, name: true } };
const trackTitle = (query) => query.search ? { title: { contains: query.search } } : {};

function visibleTracks(req) {
  const publishedHistory = { publishedAt: { not: null } };
  if (!can(req, 'learning:manage')) return publishedHistory;
  const managed = scope(req, 'learning:manage');
  return managed.department ? { OR: [publishedHistory, managed] } : {};
}

export function listTracks(req, query) {
  const access = scope(req, 'learning:read');
  const criteria = { ...access, departmentId: query.departmentId, ...trackTitle(query),
    AND: [query.status ? { status: query.status } : {}, visibleTracks(req)] };
  return readPage(prisma.learningTrack, { where: criteria, orderBy: [{ createdAt: query.sort }, { id: 'asc' }] }, query);
}

export async function trackDetail(req, id) {
  const access = scope(req, 'learning:read');
  return found(await prisma.learningTrack.findFirst({
    where: { id, ...access, AND: [visibleTracks(req)] },
    include: { department, modules: outline }
  }), 'Learning track');
}

async function lockedTrack(tx, req, id) {
  const access = scope(req, 'learning:manage');
  const { departmentId } = found(await tx.learningTrack.findFirst({ where: { id, ...access },
    select: { departmentId: true } }), 'Learning track');
  await activeDepartment(tx, departmentId, access);
  return found(await tx.learningTrack.findFirst({ where: { id, ...access } }), 'Learning track');
}

function draftOnly(track) {
  if (track.status !== 'DRAFT') throw conflict('Published and archived curriculum is immutable. Create a new version.');
}

export function createTrack(req, { departmentId, ...data }, requestId) {
  const access = scope(req, 'learning:manage');
  return transaction(async (tx) => {
    await activeDepartment(tx, departmentId, access);
    const track = await tx.learningTrack.create({ data: { ...data, departmentId, createdBy: req.user.id, trackKey: randomUUID() } });
    await audit(tx, req, requestId, 'LEARNING_TRACK_CREATED', 'LEARNING_TRACK', track.id, { departmentId, version: track.version });
    return track;
  });
}

export function editTrack(req, id, data, requestId) {
  return transaction(async (tx) => {
    const track = await lockedTrack(tx, req, id);
    draftOnly(track);
    const updated = await tx.learningTrack.update({ where: { id }, data });
    await audit(tx, req, requestId, 'LEARNING_TRACK_UPDATED', 'LEARNING_TRACK', id, { fields: Object.keys(data) });
    return updated;
  });
}

function cloneResource({ title, resourceUrl, description, sequence }) {
  return { title, resourceUrl, description, sequence };
}

export function forkTrack(req, id, requestId) {
  return transaction(async (tx) => {
    const track = await lockedTrack(tx, req, id);
    const series = { departmentId: track.departmentId, trackKey: track.trackKey };
    const latest = await tx.learningTrack.findFirst({ where: series, orderBy: { version: 'desc' }, include: { modules: outline } });
    if (latest.id !== id || latest.status === 'DRAFT') throw conflict('Create a new version from the latest published or archived version.');
    const updated = await tx.learningTrack.create({ data: {
      ...series, title: track.title, description: track.description, version: track.version + 1, createdBy: req.user.id,
      modules: { create: latest.modules.map(({ title, description, sequence, estimatedMinutes, isRequired, lessons, resources }) => ({
        title, description, sequence, estimatedMinutes, isRequired, resources: { create: resources.map(cloneResource) },
        lessons: { create: lessons.map(({ title, content, sequence, estimatedMinutes, isRequired, sourceKey, resources }) => ({
          title, content, sequence, estimatedMinutes, isRequired, sourceKey, resources: { create: resources.map(cloneResource) }
        })) }
      })) }
    } });
    await audit(tx, req, requestId, 'LEARNING_TRACK_VERSION_CREATED', 'LEARNING_TRACK', updated.id, { sourceTrackId: id, version: updated.version });
    return updated;
  });
}

export function transitionTrack(req, id, status, requestId) {
  return transaction(async (tx) => {
    const track = await lockedTrack(tx, req, id);
    const now = new Date();
    if (status === 'PUBLISHED') {
      draftOnly(track);
      const previous = await tx.learningTrack.findFirst({ where: {
        departmentId: track.departmentId, trackKey: track.trackKey, status: 'PUBLISHED'
      } });
      if (previous) {
        await tx.learningTrack.update({ where: { id: previous.id }, data: { status: 'ARCHIVED', archivedAt: now } });
        await audit(tx, req, requestId, 'LEARNING_TRACK_ARCHIVED', 'LEARNING_TRACK', previous.id, { version: previous.version });
      }
    } else if (track.status === 'ARCHIVED') {
      throw conflict('This curriculum version is already archived.');
    }
    const result = await tx.learningTrack.update({ where: { id }, data: {
      status, ...(status === 'PUBLISHED' ? { publishedAt: now } : { archivedAt: now })
    } });
    await audit(tx, req, requestId, 'LEARNING_TRACK_' + status, 'LEARNING_TRACK', id, { version: track.version });
    if (status === 'PUBLISHED') {
      await emitForReviewers(tx, { event: 'LEARNING_VERSION_AVAILABLE', type: 'LEARNING_TRACK', resourceId: id,
        rule: 'DEPARTMENT_LEARNING', departmentId: track.departmentId, actorId: req.user.id, now });
    }
    return result;
  });
}

const curriculumEntities = {
  module: { model: 'learningModule', parent: 'learningTrackId', type: 'LEARNING_MODULE', maximum: 30 },
  lesson: { model: 'lesson', parent: 'learningModuleId', type: 'LESSON', maximum: 40 },
  resource: { model: 'learningResource', parent: null, type: 'LEARNING_RESOURCE', maximum: 20 }
};

export function changeContent(req, { trackId, moduleId, lessonId, id }, kind, data, requestId) {
  const entity = curriculumEntities[kind];
  return transaction(async (tx) => {
    const track = await lockedTrack(tx, req, trackId);
    draftOnly(track);
    const parent = { [entity.parent ?? (lessonId ? 'lessonId' : 'learningModuleId')]: lessonId ?? moduleId ?? trackId };
    if (kind !== 'module') {
      found(await tx.learningModule.findFirst({ where: { id: moduleId, learningTrackId: trackId } }), 'Learning module');
      if (lessonId) found(await tx.lesson.findFirst({ where: { id: lessonId, learningModuleId: moduleId } }), 'Lesson');
    }
    const model = tx[entity.model];
    if (id) found(await model.findFirst({ where: { id, ...parent } }), 'Curriculum item');
    if (!id && await model.count({ where: parent }) >= entity.maximum) {
      throw conflict('This curriculum section has reached its item limit.', 'CURRICULUM_LIMIT');
    }
    let record;
    if (data === null) record = await model.delete({ where: { id } });
    else if (id) record = await model.update({ where: { id }, data });
    else record = await model.create({ data: { ...data, ...parent } });
    await audit(tx, req, requestId, entity.type + (data === null ? '_REMOVED' : id ? '_UPDATED' : '_CREATED'),
      entity.type, record.id, { trackId, fields: Object.keys(data ?? {}) });
    return data === null ? { id: record.id } : record;
  });
}

function lessonCounts(modules, progressRows) {
  const completed = new Set(progressRows.filter(({ status }) => status === 'COMPLETED').map(({ lessonId }) => lessonId));
  const active = new Map(progressRows.map((item) => [item.lessonId, item]));
  let required = 0;
  let completedRequired = 0;
  let optional = 0;
  let completedOptional = 0;
  const progressModules = modules.map((item) => {
    const lessons = item.lessons.map((lesson) => {
      const mandatory = item.isRequired && lesson.isRequired;
      const done = completed.has(lesson.id);
      if (mandatory) {
        required += 1;
        if (done) completedRequired += 1;
      } else {
        optional += 1;
        if (done) completedOptional += 1;
      }
      return { ...lesson, requiredForTrack: mandatory, progress: active.get(lesson.id) ?? { status: 'NOT_STARTED' } };
    });
    const requiredLessons = lessons.filter((lesson) => lesson.isRequired);
    const counted = requiredLessons.length ? requiredLessons : lessons;
    return { ...item, lessons, completed: counted.length > 0 && counted.every((lesson) => completed.has(lesson.id)) };
  });
  return { required, completedRequired, optional, completedOptional,
    percentage: required ? Math.round(completedRequired * 10000 / required) / 100 : null,
    completedModules: progressModules.filter((module) => module.completed).length,
    totalModules: progressModules.length, modules: progressModules };
}

const enrollmentTree = { track: { include: { department, modules: outline } },
  progress: { include: { corrections: { orderBy: { revision: 'desc' }, take: 1,
    select: { id: true, revision: true, createdAt: true } } } },
  internship: { select: person } };

function formatEnrollment(enrollment) {
  const { track, progress, ...record } = enrollment;
  const { modules, ...trackMeta } = track;
  return { ...record, track: trackMeta, learning: lessonCounts(modules, progress) };
}

const metricTrack = { select: { id: true, title: true, version: true, status: true,
  modules: { select: { isRequired: true, lessons: { select: { id: true, isRequired: true } } } } } };
export const enrollmentMetrics = { id: true, status: true, enrolledAt: true, track: metricTrack,
  progress: { select: { lessonId: true, status: true } }, internship: { select: person } };

export function summarizeLearning(enrollment) {
  const formatted = formatEnrollment(enrollment);
  const { modules, ...learning } = formatted.learning;
  return { ...formatted, learning };
}

async function enroll(tx, req, internship, track, requestId) {
  const where = { internshipId_learningTrackId: { internshipId: internship.id, learningTrackId: track.id } };
  const existing = await tx.learningEnrollment.findUnique({ where });
  if (existing) return existing;
  const created = await tx.learningEnrollment.create({ data: {
    ...where.internshipId_learningTrackId, curriculumVersion: track.version
  } });
  await audit(tx, req, requestId, 'LEARNING_ENROLLED', 'LEARNING_ENROLLMENT', created.id, {
    internshipId: internship.id, trackId: track.id, version: track.version
  });
  await emitNotification(tx, { event: 'LEARNING_ASSIGNED', type: 'LEARNING_ENROLLMENT', resourceId: created.id,
    recipientIds: [internship.userId] });
  return created;
}

// Application approval already holds both the department and applicant locks.
export async function enrollApprovedInternship(tx, id, now, actor, requestId) {
  const internship = await tx.internship.findFirst({ where: { id, ...eligibleWhere(now) } });
  if (internship) await syncForInternship(tx, internship, requestId, { user: actor });
}

async function syncForInternship(tx, internship, requestId, req) {
  const existing = await tx.learningEnrollment.findFirst({ where: { internshipId: internship.id }, select: { id: true } });
  if (existing) return { result: 'EXISTING' };
  const tracks = await tx.learningTrack.findMany({ where: { departmentId: internship.departmentId, status: 'PUBLISHED' }, take: 2 });
  if (tracks.length !== 1) return { result: tracks.length ? 'SELECTION_REQUIRED' : 'NO_CURRICULUM' };
  await enroll(tx, req, internship, tracks[0], requestId);
  return { result: 'ENROLLED' };
}

export function syncLearning(req, requestId) {
  const userId = own(req, 'learning');
  return transaction(async (tx) => {
    const now = new Date();
    const criteria = { userId, ...eligibleWhere(now) };
    const target = await tx.internship.findFirst({ where: criteria, orderBy: { id: 'asc' } });
    if (!target) return { result: 'INELIGIBLE' };
    await activeDepartment(tx, target.departmentId, {});
    await lockUser(tx, userId);
    const internship = await tx.internship.findFirst({ where: { ...criteria, id: target.id } });
    if (!internship) return { result: 'INELIGIBLE' };
    return syncForInternship(tx, internship, requestId, req);
  });
}

export function enrollInternship(req, trackId, internshipId, requestId) {
  return transaction(async (tx) => {
    const track = await lockedTrack(tx, req, trackId);
    if (track.status !== 'PUBLISHED') throw conflict('Only current published curriculum can receive new enrollments.');
    const target = found(await tx.internship.findFirst({ where: { id: internshipId, departmentId: track.departmentId } }), 'Internship');
    await lockUser(tx, target.userId);
    const internship = found(await tx.internship.findFirst({ where: {
      id: internshipId, departmentId: track.departmentId, ...eligibleWhere()
    } }), 'Eligible internship');
    return enroll(tx, req, internship, track, requestId);
  });
}

export async function ownLearning(req, query, includeContent) {
  const userId = own(req, 'learning');
  const where = { internship: historicalWhere(userId), track: { publishedAt: { not: null }, ...trackTitle(query) } };
  const [total, items, current] = await Promise.all([
    prisma.learningEnrollment.count({ where }),
    prisma.learningEnrollment.findMany({ where, include: includeContent ? enrollmentTree : undefined,
      select: includeContent ? undefined : enrollmentMetrics, orderBy: [{ enrolledAt: query.sort }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit, take: query.limit }),
    includeContent ? prisma.internship.findFirst({ where: { userId, ...eligibleWhere() }, select: { id: true } }) : null
  ]);
  return { items: items.map(includeContent
    ? (item) => ({ ...formatEnrollment(item), canUpdate: current?.id === item.internshipId }) : summarizeLearning),
    pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
}

export async function listLearningProgress(req, query) {
  const access = scope(req, 'learning:read');
  const where = { internshipId: query.internshipId, internship: { ...access, departmentId: query.departmentId },
    track: trackTitle(query) };
  const result = await readPage(prisma.learningEnrollment, { where, select: enrollmentMetrics,
    orderBy: [{ enrolledAt: query.sort }, { id: 'asc' }] }, query);
  return { ...result, items: result.items.map(summarizeLearning) };
}

export async function learningEnrollmentDetail(req, id, ownOnly = false) {
  const access = ownOnly ? historicalWhere(own(req, 'learning')) : scope(req, 'learning:read');
  return formatEnrollment(found(await prisma.learningEnrollment.findFirst({
    where: { id, internship: access, track: { publishedAt: { not: null } } }, include: enrollmentTree
  }), 'Learning enrollment'));
}

export function progressLesson(req, lessonId, { enrollmentId }, complete) {
  const userId = own(req, 'learning');
  return transaction(async (tx) => {
    const linked = { internship: { userId, ...eligibleWhere() }, track: { publishedAt: { not: null },
      modules: { some: { lessons: { some: { id: lessonId } } } } } };
    const target = found(await tx.learningEnrollment.findFirst({ where: { id: enrollmentId, ...linked },
      select: { track: { select: { departmentId: true } } } }), 'Eligible learning enrollment');
    await activeDepartment(tx, target.track.departmentId, {});
    await lockUser(tx, userId);
    const enrollment = found(await tx.learningEnrollment.findFirst({ where: { id: enrollmentId, ...linked },
      include: enrollmentTree }), 'Eligible learning enrollment');
    const now = new Date();
    const current = enrollment.progress.find((item) => item.lessonId === lessonId);
    if (current?.status === 'COMPLETED' || (current && !complete)) return current;
    if (complete && !current) throw conflict('Start the lesson before marking it complete.');
    if (!complete) return tx.learningProgress.create({ data: { learningEnrollmentId: enrollmentId, lessonId, startedAt: now } });
    const result = await tx.learningProgress.update({ where: { id: current.id }, data: { status: 'COMPLETED', completedAt: now } });
    const summary = lessonCounts(enrollment.track.modules, [...enrollment.progress.filter((p) => p.id !== current.id), result]);
    if (summary.required > 0 && summary.completedRequired === summary.required && enrollment.status !== 'COMPLETED') {
      await tx.learningEnrollment.update({ where: { id: enrollmentId }, data: { status: 'COMPLETED' } });
      await emitNotification(tx, { event: 'LEARNING_COMPLETED', type: 'LEARNING_ENROLLMENT', resourceId: enrollmentId,
        recipientIds: [userId], now });
      await emitForReviewers(tx, { event: 'LEARNING_COMPLETED', type: 'LEARNING_ENROLLMENT', resourceId: enrollmentId,
        rule: 'DEPARTMENT_LEARNING', departmentId: enrollment.track.departmentId, now });
    }
    return result;
  });
}

export function correctLearningProgress(req, enrollmentId, lessonId, input, requestId) {
  const access = scope(req, 'learning:manage');
  if (!req.permissions.includes('learning:correct_progress')) throw new ForbiddenError();
  return transaction(async (tx) => {
    const where = { id: enrollmentId, internship: access, track: {
      publishedAt: { not: null }, modules: { some: { lessons: { some: { id: lessonId } } } }
    } };
    const target = found(await tx.learningEnrollment.findFirst({ where, include: enrollmentTree }), 'Learning enrollment');
    if (target.internship.userId === req.user.id) throw new ForbiddenError('Self-correction is unavailable.');
    await lockedTrack(tx, req, target.learningTrackId);
    await lockUser(tx, target.internship.userId);
    const current = found(await tx.learningEnrollment.findFirst({ where, include: enrollmentTree }), 'Learning enrollment');
    const progress = found(current.progress.find((item) => item.lessonId === lessonId), 'Observed lesson progress');
    if (progress.status !== input.expectedStatus || (progress.corrections[0]?.id ?? null) !== input.expectedCorrectionId
      || progress.status === input.status) throw conflict('Reload the lesson and choose a different valid progress state.');
    const now = new Date();
    const after = await tx.learningProgress.update({ where: { id: progress.id }, data: {
      status: input.status, completedAt: input.status === 'COMPLETED' ? now : null
    } });
    const snapshot = (row) => ({ status: row.status, startedAt: row.startedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null });
    const correction = await tx.learningProgressCorrection.create({ data: {
      progressId: progress.id, correctedBy: req.user.id, reason: input.reason, revision: (progress.corrections[0]?.revision ?? 0) + 1,
      beforeState: snapshot(progress), afterState: snapshot(after), createdAt: now
    } });
    const counts = lessonCounts(current.track.modules, current.progress.map((row) => row.id === after.id ? after : row));
    const status = counts.required > 0 && counts.completedRequired === counts.required ? 'COMPLETED' : 'ACTIVE';
    if (status !== current.status) await tx.learningEnrollment.update({ where: { id: enrollmentId }, data: { status } });
    await audit(tx, req, requestId, 'LEARNING_PROGRESS_CORRECTED', 'LEARNING_PROGRESS', progress.id,
      { status: after.status, correctionId: correction.id }, { status: progress.status });
    await emitNotification(tx, { event: 'LEARNING_PROGRESS_CORRECTED', type: 'LEARNING_ENROLLMENT', resourceId: enrollmentId,
      recipientIds: [target.internship.userId], version: correction.id, now });
    return { ...after, correctionId: correction.id, enrollmentStatus: status };
  });
}
