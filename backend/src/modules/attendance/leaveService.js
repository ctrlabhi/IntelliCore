import { getPrismaClient } from '../../config/database.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { businessToday, lockUser, readPage, transaction } from '../../utils/phase04.js';
import { dateRange, policiesForDates, schedule } from './attendancePolicy.js';
import { eligibleForLeave, internAccount, internshipIdentity } from './eligibility.js';
import auditService from '../audit/auditService.js';
import { emitForReviewers, emitNotification } from '../notifications/notificationService.js';

const prisma = getPrismaClient();
export const leaveTypes = ['SICK_LEAVE', 'CASUAL_LEAVE', 'EMERGENCY_LEAVE', 'OTHER'];
export const leaveStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const include = { internship: { select: internshipIdentity } };

async function workingLeaveDates(tx, internship, startDate, endDate, today) {
  const days = dateRange(startDate, endDate, 90);
  if (days.some((day) => !eligibleForLeave(internship, day, today))) {
    throw new AppError('Leave must be within the eligible internship period.', 409, 'LEAVE_OUTSIDE_INTERNSHIP');
  }
  const policy = await policiesForDates(startDate, endDate, tx);
  const working = days.filter((day) => schedule(day, policy(day)).workingDay);
  if (!working.length) throw new AppError('Select at least one scheduled working day.', 400, 'NO_WORKING_LEAVE_DAYS');
  return working;
}

function recordedActivity(tx, internshipId, days) {
  return tx.attendance.findMany({
    where: { internshipId, businessDate: { in: days }, OR: [{ checkInAt: { not: null } }, { checkOutAt: { not: null } }] },
    select: { id: true, businessDate: true, checkInAt: true, checkOutAt: true }
  });
}

export function submitLeave(userId, input, requestId) {
  return transaction(async (tx) => {
    await lockUser(tx, userId);
    const { internshipId, startDate, endDate } = input;
    const internship = await tx.internship.findFirst({
      where: { id: internshipId, userId, user: internAccount }, include: { attendanceEligibility: true }
    });
    if (!internship) throw new NotFoundError('Internship not found.');
    const working = await workingLeaveDates(tx, internship, startDate, endDate, businessToday());
    const overlapping = await tx.leaveRequest.findFirst({
      where: { internshipId, status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: endDate }, endDate: { gte: startDate } },
      select: { id: true }
    });
    if (overlapping) throw new AppError('A pending or approved leave overlaps these dates.', 409, 'LEAVE_OVERLAP');
    const created = await tx.leaveRequest.create({ data: { ...input, workingDays: working.length }, include });
    const activity = await recordedActivity(tx, internshipId, working);
    await auditService.createAuditLog(tx, { actorUserId: userId, requestId, resourceType: 'LEAVE_REQUEST', resourceId: created.id,
      action: 'LEAVE_REQUESTED', afterState: { status: created.status, startDate, endDate, workingDays: working.length } });
    await emitForReviewers(tx, { event: 'LEAVE_REQUESTED', type: 'LEAVE_REQUEST', resourceId: created.id,
      rule: 'LEAVE_REVIEW', actorId: userId });
    return { ...created, hasRecordedActivity: activity.length > 0 };
  });
}

export function leaves(query, scope) {
  return readPage(prisma.leaveRequest, {
    where: {
      status: query.status, leaveType: query.leaveType,
      startDate: query.to ? { lte: query.to } : undefined, endDate: query.from ? { gte: query.from } : undefined,
      internship: { AND: [scope, { id: query.internshipId, departmentId: query.departmentId,
        ...(query.search ? { user: { profile: { fullName: { contains: query.search } } } } : {}) }] }
    },
    select: { id: true, internshipId: true, leaveType: true, startDate: true, endDate: true, workingDays: true,
      reason: true, status: true, reconciledActivity: true, reviewedAt: true, reviewRemarks: true, createdAt: true,
      internship: include.internship },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
  }, query);
}

export async function leaveDetail(id, scope) {
  const request = await prisma.leaveRequest.findFirst({ where: { id, internship: scope }, include });
  if (!request) throw new NotFoundError('Leave request not found.');
  const dates = dateRange(request.startDate, request.endDate, 90);
  const activity = await recordedActivity(prisma, request.internshipId, dates);
  return { ...request, hasRecordedActivity: activity.length > 0 };
}

export function decideLeave(id, decision, actor, requestId) {
  return transaction(async (tx) => {
    const own = decision.status === 'CANCELLED';
    const where = { id, ...(own ? { internship: { userId: actor.id, user: internAccount } } : {}) };
    const target = await tx.leaveRequest.findFirst({ where, select: { internship: { select: { userId: true } } } });
    if (!target) throw new NotFoundError('Leave request not found.');
    await lockUser(tx, target.internship.userId);
    const current = await tx.leaveRequest.findFirstOrThrow({ where, include: {
      internship: { include: { attendanceEligibility: true } }
    } });
    const now = new Date();
    const today = businessToday(now);
    if (!own && actor.id === current.internship.userId) {
      throw new AppError('You cannot review your own leave.', 403, 'SELF_REVIEW_FORBIDDEN');
    }
    if (current.status !== 'PENDING' && !(own && current.status === 'APPROVED' && current.startDate > today)) {
      throw new AppError('This leave request cannot change in its current state.', 409, 'LEAVE_STATE_CONFLICT');
    }
    let activity = [];
    if (decision.status === 'APPROVED') {
      const working = await workingLeaveDates(tx, current.internship, current.startDate, current.endDate, today);
      activity = await recordedActivity(tx, current.internshipId, working);
      if (activity.length && !decision.reconcileActivity) {
        throw new AppError('Recorded activity exists. Confirm the leave exception and retain the timestamps.', 409, 'LEAVE_RECONCILIATION_REQUIRED');
      }
    }
    const result = await tx.leaveRequest.update({ where: { id }, include, data: own
      ? { status: 'CANCELLED', cancelledAt: now }
      : { status: decision.status, reviewRemarks: decision.remarks, reviewedBy: actor.id, reviewedAt: now,
        reconciledActivity: activity.length > 0 } });
    await auditService.createAuditLog(tx, { actorUserId: actor.id, requestId, resourceType: 'LEAVE_REQUEST', resourceId: id,
      action: `LEAVE_${decision.status}`, beforeState: { status: current.status, recordedActivity: activity },
      afterState: { status: result.status, reconciledActivity: result.reconciledActivity } });
    if (!own) await emitNotification(tx, { event: 'LEAVE_' + result.status, type: 'LEAVE_REQUEST',
      resourceId: id, recipientIds: [current.internship.userId], now });
    return result;
  });
}
