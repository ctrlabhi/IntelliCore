
import { Router, raw } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, requireAuth, requireStatus, requireVerifiedEmail } from '../../middleware/auth.js';
import { AppError } from '../../utils/errors.js';
import { endpoint, pageFields, uuid } from '../../utils/phase04.js';
import { sendError } from '../../utils/response.js';
import logger from '../../config/logger.js';
import { attachFile, attachmentLimitBytes, downloadAttachment } from './attachmentService.js';
import { own, scope } from './workAccess.js';
import * as input from './workInput.js';
import * as tasks from './taskService.js';
import * as submissions from './submissionService.js';
import * as learning from '../learning/learningService.js';
import * as performance from './performanceService.js';

const signedIn = [authenticate, requireAuth, requireVerifiedEmail, requireStatus()];
const id = (req) => uuid.parse(req.params.id);
const body = (schema, req) => schema.parse(req.body ?? {});
const query = (schema, req) => schema.parse(req.query);
const nested = (req) => z.object({ trackId: uuid, moduleId: uuid.optional(), lessonId: uuid.optional(), id: uuid.optional() }).strict().parse(req.params);
const basicList = z.object({ ...pageFields, sort: z.enum(['asc', 'desc']).default('desc') }).strict();
const versionHeader = z.coerce.number().int().min(1).max(2147483647);
const reviewPerformance = input.performanceQuery.extend({ limit: z.coerce.number().int().min(1).max(30).default(20) });
const recipientsQuery = basicList.extend({ departmentId: uuid });
const explanation = z.string().trim().min(8).max(1000);
const scoreAmendment = z.object({ expectedRevision: z.number().int().nonnegative(), reason: explanation,
  score: input.score.optional(), criterionScores: z.array(input.score).max(12).optional() }).strict();
const lessonState = z.enum(['IN_PROGRESS', 'COMPLETED']);
const progressCorrection = z.object({ expectedStatus: lessonState, status: lessonState,
  expectedCorrectionId: uuid.nullable(), reason: explanation }).strict();
const uploadRate = rateLimit({
  windowMs: 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => sendError(res, 'Wait before uploading another attachment.', 429, 'UPLOAD_RATE_LIMIT')
});
const parseUpload = raw({ type: 'application/octet-stream', limit: attachmentLimitBytes, inflate: false });

function safeErrors(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.name === 'ZodError') return sendError(res, 'Request validation failed.', 400, 'VALIDATION_ERROR',
    error.issues.map(({ path, code }) => ({ path, code })));
  if (error instanceof AppError) return sendError(res, error.message, error.statusCode, error.code, error.details);
  logger.error({ requestId: res.locals.requestId, errorCode: error.code, name: error.name }, 'Phase 06 request failed.');
  return sendError(res, 'The operation is temporarily unavailable.', 500, 'WORK_OPERATION_FAILED');
}

function upload(purpose) {
  return [
    (req, res, next) => {
      if (purpose === 'TASK_RESOURCE') scope(req, 'tasks:manage');
      else own(req, 'tasks');
      if (!req.is('application/octet-stream')) throw new AppError('Use an octet-stream upload.', 415, 'UNSUPPORTED_UPLOAD');
      id(req);
      versionHeader.parse(req.get('x-expected-revision'));
      return next();
    },
    uploadRate,
    (req, res, next) => parseUpload(req, res, (error) => {
      if (!error) return next();
      if (error.status === 413) return next(new AppError('The attachment exceeds the configured limit.', 413, 'FILE_TOO_LARGE'));
      return next(new AppError('Unable to read the attachment stream.', error.status === 415 ? 415 : 400, 'UPLOAD_INPUT_ERROR'));
    }),
    endpoint((req, requestId) => attachFile(req, id(req), purpose, versionHeader.parse(req.get('x-expected-revision')), requestId), 201)
  ];
}

const taskRoutes = Router();
taskRoutes.use(...signedIn);
taskRoutes.get('/', endpoint((req) => tasks.listTasks(req, query(input.taskQuery, req))));
taskRoutes.post('/', endpoint((req, requestId) => tasks.createTask(req, body(input.taskCreate, req), requestId), 201));
taskRoutes.get('/templates', endpoint((req) => tasks.taskTemplates(req, query(z.object({ departmentId: uuid }).strict(), req).departmentId)));
taskRoutes.get('/eligible-recipients', endpoint((req) => tasks.eligibleRecipients(req, query(recipientsQuery, req))));
taskRoutes.get('/:id', endpoint((req) => tasks.taskDetail(req, id(req))));
taskRoutes.patch('/:id', endpoint((req, requestId) => tasks.editTask(req, id(req), body(input.taskPatch, req), requestId)));
taskRoutes.post('/:id/preview', endpoint((req) => tasks.previewRecipients(req, id(req), body(input.recipients, req))));
taskRoutes.post('/:id/publish', endpoint((req, requestId) => tasks.assignTask(req, id(req), body(input.recipients, req), requestId, true)));
for (const [action, status] of Object.entries({ close: 'CLOSED', cancel: 'CANCELLED', archive: 'ARCHIVED' })) {
  taskRoutes.post('/:id/' + action, endpoint((req, requestId) => {
    body(input.confirm, req);
    return tasks.transitionTask(req, id(req), status, requestId);
  }));
}
taskRoutes.get('/:id/assignments', endpoint((req) => tasks.listAssignments(req, query(input.assignmentQuery, req), { taskId: id(req) })));
taskRoutes.post('/:id/assignments', endpoint((req, requestId) => tasks.assignTask(req, id(req), body(input.recipients, req), requestId), 201));
taskRoutes.post('/:id/attachments', ...upload('TASK_RESOURCE'));
taskRoutes.use(safeErrors);

const assignments = Router();
assignments.use(...signedIn);
assignments.get('/', endpoint((req) => tasks.listAssignments(req, query(input.assignmentQuery, req))));
assignments.get('/me', endpoint((req) => tasks.listAssignments(req, query(input.assignmentQuery, req), { ownOnly: true })));
assignments.get('/:id', endpoint((req) => tasks.assignmentDetail(req, id(req))));
assignments.post('/:id/start', endpoint((req) => {
  body(input.empty, req);
  return tasks.startAssignment(req, id(req));
}));
assignments.post('/:id/extend', endpoint((req, requestId) => tasks.extendAssignment(req, id(req),
  body(input.confirm.extend({ dueAt: input.iso }), req).dueAt, requestId)));
assignments.post('/:id/cancel', endpoint((req, requestId) => tasks.cancelAssignment(req, id(req),
  body(input.confirm.extend({ reason: input.detail.min(8).max(1000) }), req).reason, requestId)));
assignments.get('/:id/submissions', endpoint((req) => submissions.listSubmissions(req, id(req), query(basicList, req))));
assignments.post('/:id/submissions', endpoint((req, requestId) => {
  own(req, 'tasks');
  body(input.empty, req);
  return submissions.createDraft(req, id(req), requestId);
}, 201));
assignments.use(safeErrors);

const submissionRoutes = Router();
submissionRoutes.use(...signedIn);
submissionRoutes.get('/:id', endpoint((req) => submissions.submissionDetail(req, id(req))));
submissionRoutes.patch('/:id', endpoint((req) => {
  own(req, 'tasks');
  return submissions.editDraft(req, id(req), body(input.draftPatch, req));
}));
submissionRoutes.post('/:id/submit', endpoint((req, requestId) => {
  own(req, 'tasks');
  return submissions.submitDraft(req, id(req), body(input.expectedRevision, req).expectedRevision, requestId);
}));
submissionRoutes.post('/:id/attachments', ...upload('SUBMISSION'));
submissionRoutes.get('/:id/reviews', endpoint((req) => submissions.listReviews(req, id(req), query(basicList, req))));
submissionRoutes.get('/:id/review/amendments', endpoint((req) => submissions.listAmendments(req, id(req), query(basicList, req))));
submissionRoutes.post('/:id/review', endpoint((req, requestId) => submissions.reviewSubmission(req, id(req), body(input.reviewFields, req), requestId), 201));
submissionRoutes.post('/:id/review/amend', endpoint((req, requestId) =>
  submissions.amendScore(req, id(req), body(scoreAmendment, req), requestId), 201));
submissionRoutes.use(safeErrors);

const attachmentRoutes = Router();
attachmentRoutes.use(...signedIn);
attachmentRoutes.get('/:id/download', (req, res) => downloadAttachment(req, res, id(req)));
attachmentRoutes.use(safeErrors);

const learningRoutes = Router();
learningRoutes.use(...signedIn);
learningRoutes.get('/tracks', endpoint((req) => learning.listTracks(req, query(input.trackQuery, req))));
learningRoutes.get('/tracks/:id', endpoint((req) => learning.trackDetail(req, id(req))));
learningRoutes.post('/tracks', endpoint((req, requestId) => learning.createTrack(req,
  body(input.trackFields.extend({ departmentId: uuid }), req), requestId), 201));
learningRoutes.patch('/tracks/:id', endpoint((req, requestId) => learning.editTrack(req, id(req), body(input.trackFields.partial(), req), requestId)));
learningRoutes.post('/tracks/:id/versions', endpoint((req, requestId) => {
  body(input.empty, req);
  return learning.forkTrack(req, id(req), requestId);
}, 201));
for (const [action, status] of Object.entries({ publish: 'PUBLISHED', archive: 'ARCHIVED' })) {
  learningRoutes.post('/tracks/:id/' + action, endpoint((req, requestId) => {
    body(input.confirm, req);
    return learning.transitionTrack(req, id(req), status, requestId);
  }));
}
const modules = '/tracks/:trackId/modules';
const lessons = modules + '/:moduleId/lessons';
const resourcePaths = [modules + '/:moduleId/resources', lessons + '/:lessonId/resources'];
for (const [path, kind, schema] of [[modules, 'module', input.moduleFields], [lessons, 'lesson', input.lessonFields],
  ...resourcePaths.map((path) => [path, 'resource', input.resourceFields])]) {
  learningRoutes.post(path, endpoint((req, requestId) => learning.changeContent(req, nested(req), kind, body(schema, req), requestId), 201));
  learningRoutes.patch(path + '/:id', endpoint((req, requestId) => learning.changeContent(req, nested(req), kind,
    body(schema.partial(), req), requestId)));
  if (kind === 'resource') learningRoutes.delete(path + '/:id', endpoint((req, requestId) =>
    learning.changeContent(req, nested(req), kind, null, requestId)));
}
learningRoutes.get('/eligible-recipients', endpoint((req) => tasks.eligibleRecipients(req, query(recipientsQuery, req), 'learning:manage')));
learningRoutes.post('/tracks/:id/enrollments', endpoint((req, requestId) => learning.enrollInternship(req, id(req),
  body(z.object({ internshipId: uuid }).strict(), req).internshipId, requestId), 201));
learningRoutes.post('/me/sync', endpoint((req, requestId) => {
  body(input.empty, req);
  return learning.syncLearning(req, requestId);
}));
learningRoutes.get('/me', endpoint((req) => learning.ownLearning(req, query(basicList, req), true)));
learningRoutes.get('/me/progress', endpoint((req) => learning.ownLearning(req, query(basicList, req), false)));
learningRoutes.get('/me/enrollments/:id', endpoint((req) => learning.learningEnrollmentDetail(req, id(req), true)));
learningRoutes.get('/progress', endpoint((req) => learning.listLearningProgress(req, query(input.enrollmentQuery, req))));
learningRoutes.get('/enrollments/:id', endpoint((req) => learning.learningEnrollmentDetail(req, id(req))));
learningRoutes.post('/enrollments/:id/lessons/:lessonId/correct', endpoint((req, requestId) =>
  learning.correctLearningProgress(req, id(req), uuid.parse(req.params.lessonId), body(progressCorrection, req), requestId), 201));
for (const operation of ['start', 'complete']) {
  learningRoutes.post('/lessons/:id/' + operation, endpoint((req) => learning.progressLesson(req, id(req),
    body(z.object({ enrollmentId: uuid }).strict(), req), operation === 'complete')));
}
learningRoutes.use(safeErrors);

const performanceRoutes = Router();
performanceRoutes.use(...signedIn);
performanceRoutes.get('/me', endpoint((req) => performance.ownPerformance(req, query(input.performanceQuery, req))));
performanceRoutes.get('/internships/:id', endpoint((req) => performance.internshipPerformance(req, id(req), query(input.performanceQuery, req))));
performanceRoutes.get('/departments/:id', endpoint((req) => performance.departmentPerformance(req, id(req), query(reviewPerformance, req))));
performanceRoutes.get('/summary', endpoint((req) => performance.performanceSummary(req, query(reviewPerformance, req))));
performanceRoutes.use(safeErrors);

export const workRoutes = Router();
workRoutes.use('/tasks', taskRoutes);
workRoutes.use('/task-assignments', assignments);
workRoutes.use('/task-submissions', submissionRoutes);
workRoutes.use('/attachments', attachmentRoutes);
workRoutes.use('/learning', learningRoutes);
workRoutes.use('/performance', performanceRoutes);
