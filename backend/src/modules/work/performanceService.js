
import prisma from '../../config/database.js';
import { readPage } from '../../utils/phase04.js';
import { enrollmentMetrics, summarizeLearning } from '../learning/learningService.js';
import { assignmentStatuses, dateRange } from './workInput.js';
import { overdueWhere } from './taskService.js';
import { found, historicalWhere, own, person, scope } from './workAccess.js';

function hasFeedback(req) {
  return req.permissions.includes('performance:feedback')
    && req.roles.some((role) => ['FOUNDER', 'CO_FOUNDER', 'HR_MANAGER', 'TEAM_LEADER'].includes(role));
}

async function metrics(where, learningWhere, now) {
  const [groups, overdue, enrollments] = await Promise.all([
    prisma.taskAssignment.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.taskAssignment.count({ where: { AND: [where, overdueWhere(now)] } }),
    prisma.learningEnrollment.findMany({ where: learningWhere, select: enrollmentMetrics })
  ]);
  const counts = Object.fromEntries(assignmentStatuses.map((status) => [status, 0]));
  for (const group of groups) counts[group.status] = group._count._all;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const denominator = total - counts.CANCELLED;
  const learning = { enrollments: enrollments.length, completedEnrollments: 0,
    required: 0, completedRequired: 0, optional: 0, completedOptional: 0 };
  for (const row of enrollments) {
    const item = summarizeLearning(row).learning;
    for (const key of ['required', 'completedRequired', 'optional', 'completedOptional']) learning[key] += item[key];
    if (row.status === 'COMPLETED') learning.completedEnrollments += 1;
  }
  learning.percentage = percentage(learning.completedRequired, learning.required);
  return { total, counts, pending: counts.ASSIGNED + counts.IN_PROGRESS + counts.REVISION_REQUESTED,
    awaitingReview: counts.SUBMITTED, overdue, completionRate: {
      numerator: counts.COMPLETED, denominator, percentage: percentage(counts.COMPLETED, denominator)
    }, learning };
}

function percentage(numerator, denominator) {
  return denominator ? Math.round(numerator * 10000 / denominator) / 100 : null;
}

function assignmentWhere(internship, query) {
  return { internship, assignedAt: dateRange(query) };
}

function enrollmentWhere(internship, query) {
  return { internship, enrolledAt: dateRange(query) };
}

function taskFilter(query) {
  return { ...(query.search ? { OR: [{ title: { contains: query.search } }, { taskCode: { contains: query.search } }] } : {}) };
}

async function evaluationPage(internship, query) {
  const assignment = { ...assignmentWhere(internship, query), task: taskFilter(query) };
  const result = await readPage(prisma.taskReview, { where: { submission: { assignment } },
    select: { id: true, decision: true, score: true, maximumScore: true, criterionScores: true,
      feedback: true, reviewedAt: true, reviewer: { select: { profile: { select: { fullName: true } } } },
      amendments: { orderBy: { revision: 'desc' }, take: 1,
        select: { revision: true, score: true, criterionScores: true, createdAt: true } },
      submission: { select: { submissionVersion: true, submittedAt: true, late: true,
        assignment: { select: { id: true, task: { select: { taskCode: true, title: true } } } } } } },
    orderBy: [{ reviewedAt: query.sort }, { id: 'asc' }] }, query);
  return { ...result, items: result.items.map(({ amendments, ...review }) => {
    const amendment = amendments[0];
    return amendment ? { ...review, originalScore: review.score, score: amendment.score,
      criterionScores: amendment.criterionScores, amendment } : review;
  }) };
}

async function individual(internship, query, feedback) {
  const now = new Date();
  const [summary, evaluations] = await Promise.all([
    metrics({ ...assignmentWhere(internship, query), task: taskFilter(query) }, enrollmentWhere(internship, query), now),
    feedback ? evaluationPage(internship, query) : null
  ]);
  return { summary, evaluations, serverTime: now };
}

export function ownPerformance(req, query) {
  const filter = historicalWhere(own(req, 'performance'));
  return individual({ AND: [filter, { departmentId: query.departmentId }] }, query, true);
}

export async function internshipPerformance(req, id, query) {
  const access = scope(req, 'performance:read');
  const filter = { id, departmentId: query.departmentId, ...access };
  const internship = found(await prisma.internship.findFirst({ where: filter, select: person }), 'Internship');
  return { internship, ...await individual(filter, query, hasFeedback(req)) };
}

const dept = { id: true, name: true, code: true };
const deptSearch = (value) => value ? { OR: [{ name: { contains: value } }, { code: { contains: value } }] } : {};

export async function departmentPerformance(req, id, query) {
  const access = scope(req, 'performance:read');
  const department = found(await prisma.department.findFirst({ where: { id, ...access.department }, select: dept }), 'Department');
  const now = new Date();
  const where = { departmentId: id, ...access, ...(query.search ? { OR: [{ internshipCode: { contains: query.search } },
    { user: { profile: { fullName: { contains: query.search } } } }] } : {}) };
  const rows = await readPage(prisma.internship, { where, select: person,
    orderBy: [{ commencementDate: query.sort }, { id: 'asc' }] }, query);
  const [summary, items] = await Promise.all([
    metrics(assignmentWhere(where, query), enrollmentWhere(where, query), now),
    Promise.all(rows.items.map(async (row) => {
      const filter = { ...where, id: row.id };
      return { internship: row, summary: await metrics(assignmentWhere(filter, query), enrollmentWhere(filter, query), now) };
    }))
  ]);
  return { ...rows, items, department, summary, serverTime: now };
}

export async function performanceSummary(req, query) {
  const access = scope(req, 'performance:read');
  const now = new Date();
  const filter = { ...access.department, id: query.departmentId, ...deptSearch(query.search) };
  const internships = { department: filter };
  const publication = dateRange(query);
  const where = { department: filter, publishedAt: Object.keys(publication).length ? publication : { not: null } };
  const [rows, summary, publishedTasks, taskDefinitionsEverPublished] = await Promise.all([
    readPage(prisma.department, { where: filter, select: dept,
      orderBy: [{ name: query.sort }, { id: 'asc' }] }, query),
    metrics(assignmentWhere(internships, query), enrollmentWhere(internships, query), now),
    prisma.task.count({ where: { ...where, status: 'PUBLISHED' } }),
    prisma.task.count({ where })
  ]);
  const items = await Promise.all(rows.items.map(async (department) => {
    const scoped = { departmentId: department.id, ...access };
    const [summary, publishedTasks] = await Promise.all([
      metrics(assignmentWhere(scoped, query), enrollmentWhere(scoped, query), now),
      prisma.task.count({ where: { ...where, departmentId: department.id, status: 'PUBLISHED' } })
    ]);
    return { department, summary, publishedTasks };
  }));
  return { ...rows, items, summary, publishedTasks, taskDefinitionsEverPublished, serverTime: now };
}
