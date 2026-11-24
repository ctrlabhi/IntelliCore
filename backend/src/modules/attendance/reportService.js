import { z } from 'zod';
import { getPrismaClient } from '../../config/database.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { businessToday, lockUser, readPage, transaction } from '../../utils/phase04.js';
import { readPolicy, schedule } from './attendancePolicy.js';
import { approvedLeave, dayIdentity } from './attendanceService.js';
import { eligibleInternship, internshipIdentity } from './eligibility.js';
import auditService from '../audit/auditService.js';

const prisma = getPrismaClient();
const reportText = z.string().trim().min(1).max(4000);
export const reportFields = z.object({
  workCompleted: reportText, learningSummary: reportText, progressSummary: reportText,
  blockers: reportText, nextDayPlan: reportText
}).strict();
const draftText = z.string().trim().max(4000).default('');
export const draftFields = z.object(Object.fromEntries(Object.keys(reportFields.shape).map((key) => [key, draftText]))).strict();
const reportSelect = {
  id: true, businessDate: true, internshipId: true, workCompleted: true, learningSummary: true,
  progressSummary: true, blockers: true, nextDayPlan: true, status: true, submittedAt: true,
  lateApprovedAt: true, reviewedBy: true, reviewedAt: true, reviewRemarks: true,
  internship: { select: internshipIdentity }
};

async function reportWindow(tx, userId, now) {
  const date = businessToday(now);
  const internship = await eligibleInternship(tx, userId, date);
  if (!internship) return { date, internship: null, canEdit: false };
  const policy = await readPolicy(date, tx);
  const shift = schedule(date, policy);
  const leave = await approvedLeave(internship.id, date, tx);
  return { date, internship, canEdit: shift.workingDay && !leave && now >= shift.open && now < shift.reportDeadline };
}

export async function readTodayReport(userId) {
  const { date, internship, canEdit } = await reportWindow(prisma, userId, new Date());
  const report = internship ? await prisma.dailyWorkReport.findUnique({
    where: dayIdentity(internship.id, date), select: reportSelect
  }) : null;
  return { report, canEdit: canEdit && (!report || report.status === 'DRAFT') };
}

export function saveTodayReport(userId, draft, requestId) {
  return transaction(async (tx) => {
    await lockUser(tx, userId);
    const now = new Date();
    const { date, internship, canEdit } = await reportWindow(tx, userId, now);
    if (!internship) throw new AppError('An ongoing eligible internship is required.', 409, 'DATE_NOT_ELIGIBLE');
    const where = dayIdentity(internship.id, date);
    const record = await tx.dailyWorkReport.findUnique({ where, select: reportSelect });
    if (record?.submittedAt) {
      if (draft === null) return record;
      throw new AppError('Submitted reports are preserved.', 409, 'REPORT_ALREADY_SUBMITTED');
    }
    if (!canEdit) throw new AppError('Report entry is unavailable outside the working day and 20:00 IST cutoff.', 409, 'REPORT_WINDOW_CLOSED');

    if (draft !== null) {
      return tx.dailyWorkReport.upsert({ where, create: { internshipId: internship.id, businessDate: date, ...draft },
        update: draft, select: reportSelect });
    }
    if (!record) throw new AppError('Save a report draft before submitting.', 409, 'REPORT_DRAFT_REQUIRED');
    reportFields.parse(Object.fromEntries(Object.keys(reportFields.shape).map((key) => [key, record[key]])));
    const report = await tx.dailyWorkReport.update({ where, data: { status: 'SUBMITTED', submittedAt: now }, select: reportSelect });
    await auditService.createAuditLog(tx, { actorUserId: userId, requestId, action: 'DAILY_REPORT_SUBMITTED',
      resourceType: 'DAILY_WORK_REPORT', resourceId: report.id, afterState: { status: report.status, businessDate: date } });
    return report;
  });
}

export function reports(query, scope, own) {
  return readPage(prisma.dailyWorkReport, {
    where: {
      businessDate: query.dateFilter, status: query.status ?? (own ? undefined : { in: ['SUBMITTED', 'REVIEWED'] }),
      internship: { AND: [scope, { id: query.internshipId, departmentId: query.departmentId,
        ...(query.search ? { user: { profile: { fullName: { contains: query.search } } } } : {}) }] },
      ...(!own ? { submittedAt: { not: null } } : {})
    },
    select: reportSelect, orderBy: [{ businessDate: 'desc' }, { id: 'asc' }]
  }, query);
}

export async function reportDetail(id, scope, own) {
  const report = await prisma.dailyWorkReport.findFirst({
    where: { id, internship: scope, ...(!own ? { submittedAt: { not: null } } : {}) }, select: reportSelect
  });
  if (!report) throw new NotFoundError('Daily report not found.');
  return report;
}

export function reviewReport(id, remarks, actor, requestId) {
  return transaction(async (tx) => {
    const target = await tx.dailyWorkReport.findUnique({ where: { id }, select: { internship: { select: { userId: true } } } });
    if (!target) throw new NotFoundError('Daily report not found.');
    await lockUser(tx, target.internship.userId);
    const current = await tx.dailyWorkReport.findUnique({ where: { id }, select: reportSelect });
    if (actor.id === target.internship.userId) throw new AppError('You cannot review your own report.', 403, 'SELF_REVIEW_FORBIDDEN');
    if (current.status !== 'SUBMITTED') throw new AppError('Only submitted reports can be reviewed.', 409, 'REPORT_STATE_CONFLICT');
    const result = await tx.dailyWorkReport.update({
      where: { id }, data: { status: 'REVIEWED', reviewedBy: actor.id, reviewedAt: new Date(), reviewRemarks: remarks },
      select: reportSelect
    });
    await auditService.createAuditLog(tx, { actorUserId: actor.id, requestId, resourceType: 'DAILY_WORK_REPORT',
      resourceId: id, action: 'DAILY_REPORT_REVIEWED', beforeState: { status: current.status }, afterState: { status: result.status } });
    return result;
  });
}
