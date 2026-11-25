
import prisma from '../../config/database.js';
import { AppError, ForbiddenError } from '../../utils/errors.js';
import { readPage, transaction } from '../../utils/phase04.js';
import { attachmentSummary, lockedTask, lockOwnAssignment, privateAssignmentWhere } from './taskService.js';
import { audit, conflict, found, isIntern, scope } from './workAccess.js';
import { emitForReviewers, emitNotification } from '../notifications/notificationService.js';

const included = {
  attachments: { select: attachmentSummary, orderBy: { createdAt: 'asc' } },
  review: { include: {
    reviewer: { select: { profile: { select: { fullName: true } } } },
    amendments: { orderBy: { revision: 'desc' }, take: 1,
      select: { revision: true, score: true, criterionScores: true, createdAt: true } }
  } }
};
const editable = ['IN_PROGRESS', 'REVISION_REQUESTED'];

function latest(tx, assignmentId) {
  return tx.taskSubmission.findFirst({ where: { assignmentId }, orderBy: { submissionVersion: 'desc' } });
}

function assertEditable(assignment) {
  if (!editable.includes(assignment.status)) throw conflict('Start the assignment or wait for a revision request before submitting.');
}

export async function lockOwnDraft(tx, req, id, expectedRevision) {
  const access = privateAssignmentWhere(req);
  const initial = found(await tx.taskSubmission.findFirst({ where: { id, assignment: access },
    select: { assignmentId: true } }), 'Submission');
  const { assignment, now } = await lockOwnAssignment(tx, req, initial.assignmentId);
  assertEditable(assignment);
  const draft = await latest(tx, assignment.id);
  if (draft?.id !== id || draft.status !== 'DRAFT' || draft.revision !== expectedRevision) {
    throw conflict('Reload the current submission draft.', 'STALE_SUBMISSION');
  }
  return { assignment, draft, now };
}

export function createDraft(req, assignmentId, requestId) {
  return transaction(async (tx) => {
    const { assignment } = await lockOwnAssignment(tx, req, assignmentId);
    assertEditable(assignment);
    const before = await latest(tx, assignmentId);
    if (before?.status === 'DRAFT') return before;
    const draft = await tx.taskSubmission.create({ data: { assignmentId, submittedBy: req.user.id,
      submissionVersion: (before?.submissionVersion ?? 0) + 1, additionalLinks: [] } });
    await audit(tx, req, requestId, 'TASK_SUBMISSION_DRAFT_CREATED', 'TASK_SUBMISSION', draft.id, {
      assignmentId, version: draft.submissionVersion
    });
    return draft;
  });
}

export function editDraft(req, id, { expectedRevision, ...data }) {
  return transaction(async (tx) => {
    const { draft } = await lockOwnDraft(tx, req, id, expectedRevision);
    if (!Object.keys(data).length) return draft;
    return tx.taskSubmission.update({ where: { id }, data: { ...data, revision: { increment: 1 } }, include: included });
  });
}

export function submitDraft(req, id, expectedRevision, requestId) {
  return transaction(async (tx) => {
    const { assignment, draft, now } = await lockOwnDraft(tx, req, id, expectedRevision);
    const files = await tx.fileAttachment.count({ where: { submissionId: id } });
    if (!draft.writtenResponse && !draft.projectUrl && !draft.repositoryUrl && !draft.additionalLinks.length && !files) {
      throw new AppError('Provide a written response, link or attachment before submitting.', 400, 'EMPTY_SUBMISSION');
    }
    const task = assignment.task;
    const deadlineAt = assignment.dueAt ?? task.dueAt;
    const taskSnapshot = { revision: task.revision, title: task.title, instructions: task.instructions,
      deliverables: task.deliverables, resources: task.resources, rubric: task.rubric, maximumScore: task.maximumScore };
    const submitted = await tx.taskSubmission.update({ where: { id }, data: { submittedAt: now, deadlineAt,
      late: now > deadlineAt, status: 'SUBMITTED', taskSnapshot, revision: { increment: 1 } }, include: included });
    await tx.taskAssignment.update({ where: { id: assignment.id }, data: { status: 'SUBMITTED', submittedAt: now } });
    await audit(tx, req, requestId, 'TASK_SUBMITTED', 'TASK_SUBMISSION', id, {
      assignmentId: assignment.id, version: draft.submissionVersion, deadlineAt, late: submitted.late
    });
    await emitForReviewers(tx, { event: 'TASK_SUBMITTED', type: 'TASK_SUBMISSION', resourceId: id,
      rule: 'TASK_REVIEW', departmentId: task.departmentId, actorId: req.user.id, now });
    return submitted;
  });
}

function submittedScope(req) {
  return isIntern(req) ? {} : { status: 'SUBMITTED' };
}

export async function listSubmissions(req, id, query) {
  const access = privateAssignmentWhere(req);
  found(await prisma.taskAssignment.findFirst({ where: { id, ...access }, select: { id: true } }), 'Assignment');
  const where = { assignmentId: id, assignment: access, ...submittedScope(req) };
  const [total, items] = await Promise.all([
    prisma.taskSubmission.count({ where }),
    prisma.taskSubmission.findMany({ where, include: included, orderBy: { submissionVersion: query.sort },
      skip: (query.page - 1) * query.limit, take: query.limit })
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
}

export async function submissionDetail(req, id) {
  return found(await prisma.taskSubmission.findFirst({ where: { id, assignment: privateAssignmentWhere(req),
    ...submittedScope(req) }, include: included }), 'Submission');
}

export async function listReviews(req, id, query) {
  const submission = await submissionDetail(req, id);
  return readPage(prisma.taskReview, { where: { submissionId: submission.id },
    orderBy: [{ reviewedAt: query.sort }, { id: 'asc' }] }, query);
}

export async function listAmendments(req, id, query) {
  const submission = await submissionDetail(req, id);
  return readPage(prisma.taskScoreAmendment, { where: { review: { submissionId: submission.id } },
    select: { id: true, revision: true, score: true, criterionScores: true, createdAt: true },
    orderBy: { revision: query.sort } }, query);
}

export function evaluateScore(snapshot, { score, criterionScores }) {
  const maximumScore = snapshot.maximumScore;
  const rubric = snapshot.rubric;
  if (criterionScores?.length) {
    if (criterionScores.length !== rubric.length || criterionScores.some((value, idx) => value > rubric[idx].points)) {
      throw new AppError('Enter a valid score for each recorded criterion.', 400, 'INVALID_SCORE');
    }
    const total = criterionScores.reduce((sum, value) => sum + value, 0);
    if (score != null && score !== total) throw new AppError('The score must match the rubric total.', 400, 'INVALID_SCORE');
    return { maximumScore, score: total, criterionScores };
  }
  if (score != null && (maximumScore === null || score > maximumScore || rubric.length)) {
    throw new AppError('Use the recorded score range and rubric.', 400, 'INVALID_SCORE');
  }
  return { maximumScore, score: score ?? null, criterionScores: [] };
}

export function reviewSubmission(req, id, input, requestId) {
  const access = scope(req, 'tasks:review');
  return transaction(async (tx) => {
    const initial = found(await tx.taskSubmission.findFirst({ where: { id, assignment: { task: access } },
      select: { assignment: { select: { taskId: true, assignedTo: true } } } }), 'Submission');
    if (initial.assignment.assignedTo === req.user.id) throw new ForbiddenError('Self-review is unavailable.');
    const task = await lockedTask(tx, req, initial.assignment.taskId, 'tasks:review');
    const submission = found(await tx.taskSubmission.findFirst({ where: { id, status: 'SUBMITTED' },
      include: { assignment: true, review: true } }), 'Submitted work');
    const { assignment } = submission;
    if (submission.review || assignment.status !== 'SUBMITTED' || (await latest(tx, assignment.id))?.id !== id) {
      throw conflict('Only the current unreviewed submission may be reviewed.', 'STALE_SUBMISSION');
    }
    const approved = input.decision === 'APPROVED';
    if (task.status !== 'PUBLISHED' && !(approved && task.status === 'CLOSED')) {
      throw conflict('This task no longer allows that review decision.');
    }
    const scored = evaluateScore(submission.taskSnapshot, input);
    const review = await tx.taskReview.create({ data: { submissionId: id, reviewedBy: req.user.id,
      decision: input.decision, feedback: input.feedback, ...scored } });
    await tx.taskAssignment.update({ where: { id: assignment.id }, data: {
      status: approved ? 'COMPLETED' : 'REVISION_REQUESTED', completedAt: approved ? review.reviewedAt : null
    } });
    await audit(tx, req, requestId, approved ? 'TASK_APPROVED' : 'TASK_REVISION_REQUESTED', 'TASK_REVIEW', review.id, {
      assignmentId: assignment.id, submissionId: id, version: submission.submissionVersion,
      score: review.score, maximumScore: review.maximumScore
    });
    await emitNotification(tx, { event: approved ? 'TASK_APPROVED' : 'TASK_REVISION_REQUESTED', type: 'TASK_ASSIGNMENT',
      resourceId: assignment.id, version: review.id, recipientIds: [assignment.assignedTo] });
    return review;
  });
}

export function amendScore(req, id, input, requestId) {
  const access = scope(req, 'tasks:review');
  if (!req.permissions.includes('tasks:amend_score')) throw new ForbiddenError();
  return transaction(async (tx) => {
    const target = found(await tx.taskSubmission.findFirst({ where: { id, assignment: { task: access } },
      select: { assignment: { select: { taskId: true, assignedTo: true, id: true, status: true } } } }), 'Submission');
    if (target.assignment.assignedTo === req.user.id) throw new ForbiddenError('Self-review is unavailable.');
    await lockedTask(tx, req, target.assignment.taskId, 'tasks:review');
    const submission = found(await tx.taskSubmission.findUnique({ where: { id }, include: {
      assignment: true, review: { include: { amendments: { orderBy: { revision: 'desc' }, take: 1 } } }
    } }), 'Submission');
    const review = submission.review;
    if (review?.decision !== 'APPROVED' || submission.assignment.status !== 'COMPLETED') {
      throw conflict('An approved submission is required for a score amendment.');
    }
    const previous = review.amendments[0];
    const revision = (previous?.revision ?? 0) + 1;
    if (input.expectedRevision !== revision - 1) throw conflict('Reload the current score before amending.');
    const scored = evaluateScore(submission.taskSnapshot, input);
    if (scored.score == null || scored.maximumScore == null) throw new AppError('Enter a valid score for this rubric.', 400, 'INVALID_SCORE');
    if ((previous?.score ?? review.score) === scored.score
      && JSON.stringify(previous?.criterionScores ?? review.criterionScores) === JSON.stringify(scored.criterionScores)) {
      throw conflict('The proposed score is unchanged.');
    }
    const result = await tx.taskScoreAmendment.create({ data: { reviewId: review.id, amendedBy: req.user.id, revision,
      score: scored.score, criterionScores: scored.criterionScores, reason: input.reason },
    select: { id: true, score: true, revision: true, criterionScores: true, createdAt: true } });
    await audit(tx, req, requestId, 'TASK_SCORE_AMENDED', 'TASK_REVIEW', review.id,
      { amendmentId: result.id, score: result.score, revision }, { score: previous?.score ?? review.score });
    await emitNotification(tx, { event: 'TASK_SCORE_AMENDED', type: 'TASK_ASSIGNMENT',
      resourceId: submission.assignmentId, recipientIds: [submission.assignment.assignedTo], version: result.id });
    return result;
  });
}
