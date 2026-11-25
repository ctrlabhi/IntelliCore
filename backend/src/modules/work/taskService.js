
import { createHash, randomUUID } from 'node:crypto';
import prisma from '../../config/database.js';
import { AppError } from '../../utils/errors.js';
import { businessToday, lockUser, readPage, transaction } from '../../utils/phase04.js';
import { recoveredTemplates } from '../learning/curriculumCatalog.js';
import { emitNotification, emitNotifications } from '../notifications/notificationService.js';
import { activeDepartment, audit, conflict, eligibleWhere, found, historicalWhere, isIntern, lockUsers,
  missing, own, person, scope, can } from './workAccess.js';

export const attachmentSummary = {
  id: true, originalFilename: true, mimeType: true, fileSize: true, attachmentPurpose: true, createdAt: true
};

const department = { select: { id: true, name: true, code: true } };
export const waitingForWork = ['ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUESTED'];
const stableTaskSort = (sort) => [{ dueAt: sort }, { id: 'asc' }];
const taskSearch = (search) => search ? { OR: [{ title: { contains: search } }, { taskCode: { contains: search } }] } : {};
const assignmentEvent = (event, assignment, version) => ({ event, type: 'TASK_ASSIGNMENT', resourceId: assignment.id,
  recipientIds: [assignment.assignedTo], version });

function visibleTasks(req) {
  const publishedHistory = { publishedAt: { not: null } };
  if (!can(req, 'tasks:manage')) return publishedHistory;
  const managed = scope(req, 'tasks:manage');
  return managed.department ? { OR: [publishedHistory, managed] } : {};
}

function staffAttachments(req) {
  const scopes = [];
  if (can(req, 'tasks:manage')) scopes.push({ task: scope(req, 'tasks:manage') });
  if (can(req, 'tasks:review')) scopes.push({ task: { ...scope(req, 'tasks:review'), publishedAt: { not: null } } });
  return { select: attachmentSummary, where: { OR: scopes } };
}

export function overdueWhere(now) {
  return { status: { in: waitingForWork }, task: { status: 'PUBLISHED', availableFrom: { lte: now } },
    OR: [{ dueAt: { lt: now } }, { dueAt: null, task: { dueAt: { lt: now } } }] };
}

export function assignmentPresentation(row, now = new Date()) {
  const dueAt = row.dueAt ?? row.task.dueAt;
  const actionable = waitingForWork.includes(row.status) && row.task.status === 'PUBLISHED'
    && row.task.availableFrom <= now;
  const overdue = actionable && dueAt < now;
  const dueToday = actionable && +businessToday(dueAt) === +businessToday(now);
  return { ...row, effectiveDueAt: dueAt, serverTime: now, overdue, dueToday, actionable };
}

export function taskTemplates(req, departmentId) {
  const access = scope(req, 'tasks:manage');
  return prisma.department.findFirst({ where: { id: departmentId, isActive: true, ...access.department } })
    .then((record) => recoveredTemplates[found(record, 'Department').code] ?? []);
}

function validateTask(data) {
  if (data.dueAt <= data.availableFrom) throw new AppError('The deadline must follow availability.', 400, 'INVALID_DEADLINE');
  const names = data.rubric.map(({ criterion }) => criterion.toLowerCase());
  if (new Set(names).size !== names.length
      || (names.length && data.rubric.reduce((sum, row) => sum + row.points, 0) !== data.maximumScore)) {
    throw new AppError('Use distinct criteria with points that add up to the maximum score.', 400, 'INVALID_RUBRIC');
  }
}

export function listTasks(req, query) {
  const access = scope(req, 'tasks:read');
  const where = { ...access, ...taskSearch(query.search), departmentId: query.departmentId,
    AND: [query.status ? { status: query.status } : {}, visibleTasks(req)] };
  return readPage(prisma.task, { where, orderBy: stableTaskSort(query.sort) }, query);
}

export async function taskDetail(req, id) {
  const access = scope(req, 'tasks:read');
  return found(await prisma.task.findFirst({
    where: { id, ...access, AND: [visibleTasks(req)] },
    include: { department, attachments: staffAttachments(req) }
  }), 'Task');
}

export async function lockedTask(tx, req, id, capability) {
  const access = scope(req, capability);
  const initial = found(await tx.task.findFirst({ where: { id, ...access }, select: { departmentId: true } }), 'Task');
  await activeDepartment(tx, initial.departmentId, access);
  await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${id} FOR UPDATE`;
  return found(await tx.task.findFirst({ where: { id, ...access } }), 'Task');
}

export function createTask(req, { templateKey, ...data }, requestId) {
  const access = scope(req, 'tasks:manage');
  return transaction(async (tx) => {
    const dept = await activeDepartment(tx, data.departmentId, access);
    const template = templateKey && found(recoveredTemplates[dept.code]?.find((item) => item.templateKey === templateKey), 'Task template');
    const fields = template ? { ...data, ...template } : data;
    validateTask(fields);
    const task = await tx.task.create({ data: { ...fields, createdBy: req.user.id, taskCode: 'TASK-' + randomUUID() } });
    await audit(tx, req, requestId, 'TASK_CREATED', 'TASK', task.id, { revision: task.revision, departmentId: task.departmentId, templateKey });
    return task;
  });
}

export function editTask(req, id, { expectedRevision, confirmActiveChange, ...data }, requestId) {
  return transaction(async (tx) => {
    const before = await lockedTask(tx, req, id, 'tasks:manage');
    if (before.revision !== expectedRevision) throw conflict('Reload the task before editing.', 'STALE_TASK');
    if (!Object.keys(data).length) return before;
    if (before.status !== 'DRAFT' && before.status !== 'PUBLISHED') throw conflict('Only drafts and published tasks can be edited.');
    if (before.status === 'PUBLISHED') {
      if (!confirmActiveChange) throw conflict('Confirm changes affecting active assignments.', 'CONFIRMATION_REQUIRED');
      if (['taskType', 'availableFrom'].some((field) => field in data && String(data[field]) !== String(before[field]))) {
        throw conflict('Task type and availability are fixed after publication.');
      }
      if (data.dueAt && data.dueAt < before.dueAt) throw conflict('A published deadline can only be extended.');
    }
    validateTask({ ...before, ...data });
    const after = await tx.task.update({ where: { id }, data: { ...data, revision: { increment: 1 } } });
    const changed = Object.keys(data);
    await audit(tx, req, requestId, data.dueAt && +data.dueAt !== +before.dueAt ? 'TASK_DEADLINE_CHANGED' : 'TASK_UPDATED',
      'TASK', id, { changed, revision: after.revision, dueAt: after.dueAt }, { revision: before.revision, dueAt: before.dueAt });
    if (before.status === 'PUBLISHED' && data.dueAt && +data.dueAt !== +before.dueAt) {
      const assignments = await tx.taskAssignment.findMany({ where: { taskId: id, dueAt: null, status: { in: waitingForWork } },
        select: { id: true, assignedTo: true } });
      await emitNotifications(tx, assignments.map((row) => assignmentEvent('TASK_DEADLINE_CHANGED', row, after.revision)));
    }
    return after;
  });
}

function recipientFilter(req, query, dept, now, capability) {
  const access = scope(req, capability);
  return { ...eligibleWhere(now), departmentId: dept, AND: [access],
    ...(query.search ? { OR: [{ internshipCode: { contains: query.search } },
      { user: { profile: { fullName: { contains: query.search } } } }] } : {}) };
}

export function eligibleRecipients(req, query, capability = 'tasks:manage') {
  return readPage(prisma.internship, { where: recipientFilter(req, query, query.departmentId, new Date(), capability),
    select: person, orderBy: [{ internshipCode: 'asc' }, { id: 'asc' }] }, query);
}

async function recipientRows(tx, task, choices, now, { allDepartment = false, lock = false } = {}) {
  if (!allDepartment && !choices.length) throw conflict('Select at least one eligible recipient.', 'RECIPIENT_REQUIRED');
  if (allDepartment && choices.length) throw new AppError('A department publication snapshots all eligible internships.', 400, 'RECIPIENT_MODE');
  const where = { departmentId: task.departmentId, ...(!allDepartment && { id: { in: choices.map((row) => row.internshipId) } }),
    ...eligibleWhere(now) };
  const eligible = () => tx.internship.findMany({ where, select: person, orderBy: { id: 'asc' } });
  let rows = await eligible();
  if (lock) {
    await lockUsers(tx, rows.map(({ userId }) => userId));
    const lockedIds = new Set(rows.map(({ id }) => id));
    rows = (await eligible()).filter(({ id }) => lockedIds.has(id));
  }
  if (!rows.length || (!allDepartment && rows.length !== choices.length)) {
    throw conflict('Select currently eligible internships in the task department.', 'INELIGIBLE_RECIPIENT');
  }
  const overrides = new Map(choices.map(({ internshipId, dueAt }) => [internshipId, dueAt]));
  return rows.map((row) => {
    const dueAt = overrides.get(row.id) ?? null;
    if (dueAt && dueAt <= task.dueAt) throw new AppError('Individual deadlines must extend the task deadline.', 400, 'INVALID_DEADLINE');
    return { internship: row, dueAt };
  });
}

export async function previewRecipients(req, id, input) {
  const access = scope(req, 'tasks:manage');
  const task = found(await prisma.task.findFirst({ where: { id, ...access, department: { ...access.department, isActive: true } } }), 'Task');
  if (!['DRAFT', 'PUBLISHED'].includes(task.status)) throw conflict('This task no longer accepts assignments.');
  const items = await recipientRows(prisma, task, input.recipients, new Date(), {
    allDepartment: task.status === 'DRAFT' && task.taskType === 'DEPARTMENT'
  });
  return { revision: task.revision, items, previewToken: recipientFingerprint(task, items) };
}

function recipientFingerprint(task, rows) {
  return createHash('sha256').update(JSON.stringify([task.id, task.revision,
    rows.map(({ internship, dueAt }) => [internship.id, dueAt])])).digest('hex');
}

export function assignTask(req, id, input, requestId, publish = false) {
  return transaction(async (tx) => {
    const task = await lockedTask(tx, req, id, 'tasks:manage');
    const now = new Date();
    if (input.expectedRevision !== task.revision) throw conflict('Preview the current task revision before assigning.', 'STALE_TASK');
    if (publish ? task.status !== 'DRAFT' : task.status !== 'PUBLISHED') throw conflict('This task cannot accept that action.');
    if (!publish && !input.confirmActiveChange) throw conflict('Confirm assigning additional recipients.', 'CONFIRMATION_REQUIRED');
    if (publish && task.dueAt <= now) throw conflict('Publish with a deadline in the future.', 'DEADLINE_PASSED');
    const rows = await recipientRows(tx, task, input.recipients, now, {
      allDepartment: publish && task.taskType === 'DEPARTMENT', lock: true
    });
    if (input.previewToken !== recipientFingerprint(task, rows)) {
      throw conflict('Recipient eligibility changed or the preview is missing. Preview the current recipients.', 'STALE_RECIPIENT_PREVIEW');
    }
    const existing = await tx.taskAssignment.count({ where: { taskId: id, internshipId: { in: rows.map(({ internship }) => internship.id) } } });
    if (existing) throw conflict('An internship already has this assignment.', 'DUPLICATE_ASSIGNMENT');
    const assignments = rows.map(({ internship, dueAt }) => ({ id: randomUUID(),
      taskId: id, internshipId: internship.id, assignedTo: internship.userId, assignedBy: req.user.id, assignedAt: now, dueAt
    }));
    await tx.taskAssignment.createMany({ data: assignments });
    const updated = publish ? await tx.task.update({ where: { id }, data: {
      status: 'PUBLISHED', publishedAt: now, revision: { increment: 1 }
    } }) : task;
    if (publish) await audit(tx, req, requestId, 'TASK_PUBLISHED', 'TASK', id, { revision: updated.revision, assignedCount: rows.length });
    await audit(tx, req, requestId, 'TASK_ASSIGNED', 'TASK', id, {
      recipients: rows.map(({ internship, dueAt }) => ({ internshipId: internship.id, dueAt }))
    });
    await emitNotifications(tx, assignments.map((row) => assignmentEvent('TASK_ASSIGNED', row)));
    return { task: updated, assignedCount: rows.length };
  });
}

export function transitionTask(req, id, transition, requestId) {
  return transaction(async (tx) => {
    const before = await lockedTask(tx, req, id, 'tasks:manage');
    const allowed = { CLOSED: ['PUBLISHED'], CANCELLED: ['DRAFT', 'PUBLISHED'], ARCHIVED: ['CLOSED', 'CANCELLED'] };
    if (!allowed[transition].includes(before.status)) throw conflict('That task transition is unavailable.');
    if (transition === 'ARCHIVED' && await tx.taskAssignment.count({ where: { taskId: id, status: 'SUBMITTED' } })) {
      throw conflict('Review submitted work before archiving a closed task.');
    }
    if (transition === 'CANCELLED') {
      const where = { taskId: id, status: { notIn: ['COMPLETED', 'CANCELLED'] } };
      const affected = await tx.taskAssignment.findMany({ where, select: { id: true, assignedTo: true } });
      await tx.taskAssignment.updateMany({ where, data: { status: 'CANCELLED' } });
      await emitNotifications(tx, affected.map((row) => assignmentEvent('TASK_CANCELLED', row)));
    }
    const after = await tx.task.update({ where: { id }, data: { status: transition, revision: { increment: 1 },
      ...(transition === 'ARCHIVED' ? { archivedAt: new Date() } : {}) } });
    await audit(tx, req, requestId, 'TASK_' + transition, 'TASK', id, { status: after.status }, { status: before.status });
    return after;
  });
}

export function extendAssignment(req, id, dueAt, requestId) {
  return transaction(async (tx) => {
    const initial = found(await tx.taskAssignment.findUnique({ where: { id }, select: { taskId: true } }), 'Assignment');
    const task = await lockedTask(tx, req, initial.taskId, 'tasks:manage');
    const before = found(await tx.taskAssignment.findUnique({ where: { id } }), 'Assignment');
    if (task.status !== 'PUBLISHED' || !waitingForWork.includes(before.status)
      || dueAt <= (before.dueAt ?? task.dueAt) || dueAt <= new Date()) {
      throw conflict('Extend an active assignment to a later future deadline.');
    }
    const after = await tx.taskAssignment.update({ where: { id }, data: { dueAt } });
    await audit(tx, req, requestId, 'TASK_ASSIGNMENT_DEADLINE_CHANGED', 'TASK_ASSIGNMENT', id,
      { dueAt }, { dueAt: before.dueAt ?? task.dueAt });
    await emitNotification(tx, assignmentEvent('TASK_DEADLINE_CHANGED', after, dueAt.toISOString()));
    return after;
  });
}

export function cancelAssignment(req, id, reason, requestId) {
  const access = scope(req, 'tasks:manage');
  return transaction(async (tx) => {
    const target = found(await tx.taskAssignment.findFirst({ where: { id, task: access },
      select: { taskId: true } }), 'Assignment');
    const task = await lockedTask(tx, req, target.taskId, 'tasks:manage');
    const before = found(await tx.taskAssignment.findUnique({ where: { id } }), 'Assignment');
    if (!['PUBLISHED', 'CLOSED'].includes(task.status) || ['COMPLETED', 'CANCELLED'].includes(before.status)) {
      throw conflict('Only an unfinished assignment in a published or closed task can be cancelled.');
    }
    const after = await tx.taskAssignment.update({ where: { id }, data: { status: 'CANCELLED' } });
    await audit(tx, req, requestId, 'TASK_ASSIGNMENT_CANCELLED', 'TASK_ASSIGNMENT', id,
      { status: after.status, reason }, { status: before.status });
    await emitNotification(tx, assignmentEvent('TASK_CANCELLED', after));
    return after;
  });
}

export const ownAssignmentWhere = (userId, now) => ({
  assignedTo: userId, internship: historicalWhere(userId, now),
  OR: [{ task: { availableFrom: { lte: now } } }, { startedAt: null }]
});

export const privateAssignmentWhere = (req) => isIntern(req) ? ownAssignmentWhere(own(req, 'tasks'), new Date())
  : { task: scope(req, 'tasks:review'), assignedTo: { not: req.user.id } };

const taskPreview = { id: true, taskCode: true, title: true, dueAt: true, availableFrom: true,
  priority: true, status: true, taskType: true, department: true };

function hideUnreleased(row, now) {
  if (row.task.availableFrom <= now || row.startedAt || row.submittedAt) return row;
  return { ...row, task: Object.fromEntries(Object.keys(taskPreview).filter((key) => key in row.task)
    .map((key) => [key, row.task[key]])) };
}

export async function listAssignments(req, query, { taskId, ownOnly = false } = {}) {
  const now = new Date();
  const access = ownOnly ? ownAssignmentWhere(own(req, 'tasks'), now) : { task: scope(req, 'tasks:read') };
  if (taskId) await taskDetail(req, taskId);
  const criteria = overdueWhere(now);
  const where = { ...access, taskId, internshipId: query.internshipId, status: query.status,
    AND: [
      query.departmentId ? { task: { departmentId: query.departmentId } } : {},
      query.search ? { OR: [{ task: taskSearch(query.search) }, { internship: { internshipCode: { contains: query.search } } }] } : {},
      query.overdue === undefined ? {} : query.overdue ? criteria : { NOT: criteria }
    ] };
  const result = await readPage(prisma.taskAssignment, { where,
    select: { id: true, taskId: true, status: true, dueAt: true, assignedAt: true, startedAt: true, submittedAt: true,
      completedAt: true, internship: { select: person }, task: { select: taskPreview } },
    orderBy: [{ assignedAt: query.sort }, { id: 'asc' }] }, query);
  return { ...result, items: result.items.map((row) => assignmentPresentation(row, now)) };
}

export async function assignmentDetail(req, id) {
  const now = new Date();
  const ownOnly = isIntern(req);
  const access = ownOnly ? ownAssignmentWhere(own(req, 'tasks'), now) : { task: scope(req, 'tasks:read') };
  const row = found(await prisma.taskAssignment.findFirst({ where: { id, ...access }, include: {
    internship: { select: person },
    task: { include: { department, attachments: ownOnly ? { select: attachmentSummary } : staffAttachments(req) } }
  } }), 'Assignment');
  return assignmentPresentation(ownOnly ? hideUnreleased(row, now) : row, now);
}

export async function lockOwnAssignment(tx, req, id) {
  const userId = own(req, 'tasks');
  const summary = found(await tx.taskAssignment.findFirst({ where: { id, assignedTo: userId, internship: { userId } },
    select: { taskId: true, task: { select: { departmentId: true } } } }), 'Assignment');
  await activeDepartment(tx, summary.task.departmentId, {});
  await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${summary.taskId} FOR UPDATE`;
  await lockUser(tx, userId);
  const now = new Date();
  const assignment = found(await tx.taskAssignment.findFirst({
    where: { id, assignedTo: userId, internship: { userId, ...eligibleWhere(now) } }, include: { task: true }
  }), 'Eligible assignment');
  if (assignment.task.status !== 'PUBLISHED' || assignment.task.availableFrom > now) {
    throw conflict('This task is unavailable for work.');
  }
  return { assignment, now };
}

export function startAssignment(req, id) {
  return transaction(async (tx) => {
    const { assignment, now } = await lockOwnAssignment(tx, req, id);
    if (assignment.status === 'IN_PROGRESS') return assignment;
    if (assignment.status !== 'ASSIGNED') throw conflict('This assignment cannot be started.');
    return tx.taskAssignment.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: now } });
  });
}
