import { z } from 'zod';
import { getPrismaClient } from '../../config/database.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { businessDate, businessToday, lockUser, readPage, transaction, uuid } from '../../utils/phase04.js';
import { coversDate, readPolicy, schedule } from './attendancePolicy.js';
import { approvedLeave, dayIdentity } from './attendanceService.js';
import { internshipIdentity, ownedHistoricalDate } from './eligibility.js';
import { reportFields } from './reportService.js';
import auditService from '../audit/auditService.js';

const prisma = getPrismaClient();
const statuses = ['PENDING', 'APPROVED', 'REJECTED'];
export const correctionStatuses = statuses;
export const remarksSchema = z.string().trim().min(8).max(2000);
const instant = z.string().datetime({ offset: true });
const timeChanges = z.object({ checkInAt: instant.optional(), checkOutAt: instant.optional() }).strict()
  .refine((value) => value.checkInAt || value.checkOutAt, 'Propose at least one timestamp.');
const requestFields = { internshipId: uuid, businessDate, reason: remarksSchema };
export const correctionInput = z.discriminatedUnion('kind', [
  z.object({ ...requestFields, kind: z.literal('TIMESTAMPS'), proposedChanges: timeChanges }).strict(),
  z.object({ ...requestFields, kind: z.literal('LATE_REPORT'), proposedChanges: reportFields }).strict()
]);
const include = { attendance: { include: { internship: { select: internshipIdentity } } } };

function timestamps(proposed, current, date, policy, periods, now) {
  const start = proposed.checkInAt ? new Date(proposed.checkInAt) : current.checkInAt;
  const end = proposed.checkOutAt ? new Date(proposed.checkOutAt) : current.checkOutAt;
  const shift = schedule(date, policy);
  const eligibleAtStart = start && periods.some((period) => coversDate(period, date)
    && period.startsAt <= start && (!period.endsAt || start < period.endsAt));
  if (!eligibleAtStart || start < shift.open || start > shift.close || start > now
    || (end && (end < start || end > now || +businessToday(end) !== +date))) {
    throw new AppError('Use ordered, verified times on the same eligible business date.', 400, 'INVALID_CORRECTION_TIMES');
  }
  return { checkInAt: start, checkOutAt: end };
}

async function correctionWindow(tx, internship, date, kind, now, existing) {
  const policy = existing ? await tx.attendancePolicy.findUniqueOrThrow({ where: { id: existing.policyId } }) : await readPolicy(date, tx);
  const shift = schedule(date, policy);
  if (!shift.workingDay || await approvedLeave(internship.id, date, tx) || now <= shift.close
    || (kind === 'LATE_REPORT' && now < shift.reportDeadline)) {
    throw new AppError('Corrections are available for completed eligible working windows only.', 409, 'CORRECTION_WINDOW_CLOSED');
  }
  return policy;
}

function snapshot(record, report) {
  return { revision: record.revision, source: record.source, checkInAt: record.checkInAt?.toISOString() ?? null,
    checkOutAt: record.checkOutAt?.toISOString() ?? null, reportStatus: report?.status ?? null,
    reportSubmittedAt: report?.submittedAt?.toISOString() ?? null };
}

export function requestCorrection(userId, { internshipId, businessDate: date, reason, kind, proposedChanges }, requestId) {
  return transaction(async (tx) => {
    await lockUser(tx, userId);
    const now = new Date();
    const internship = await ownedHistoricalDate(tx, userId, internshipId, date);
    const where = dayIdentity(internshipId, date);
    const existing = await tx.attendance.findUnique({ where });
    const policy = await correctionWindow(tx, internship, date, kind, now, existing);
    const report = await tx.dailyWorkReport.findUnique({ where });
    if (kind === 'LATE_REPORT' && report?.submittedAt) {
      throw new AppError('A submitted report already exists for that date.', 409, 'REPORT_ALREADY_SUBMITTED');
    }
    if (kind === 'TIMESTAMPS') timestamps(proposedChanges, existing ?? {}, date, policy, internship.attendanceEligibility, now);
    const record = existing ?? await tx.attendance.create({
      data: { internshipId, businessDate: date, policyId: policy.id, source: 'CORRECTION' }
    });
    const pending = await tx.attendanceCorrection.findFirst({
      where: { attendanceId: record.id, status: 'PENDING' }, select: { id: true }
    });
    if (pending) throw new AppError('A correction is already pending for this date.', 409, 'CORRECTION_PENDING');
    const request = await tx.attendanceCorrection.create({
      data: { attendanceId: record.id, requestedBy: userId, kind, reason, proposedChanges, originalValues: snapshot(record, report), createdAt: now },
      include
    });
    await auditService.createAuditLog(tx, { actorUserId: userId, requestId, resourceType: 'ATTENDANCE_CORRECTION',
      resourceId: request.id, action: 'ATTENDANCE_CORRECTION_REQUESTED', afterState: { kind, status: request.status } });
    return request;
  });
}

export function listCorrections(query, scope) {
  return readPage(prisma.attendanceCorrection, {
    where: { status: query.status, attendance: { businessDate: query.dateFilter, internship: { AND: [scope, {
      id: query.internshipId, departmentId: query.departmentId,
      ...(query.search ? { user: { profile: { fullName: { contains: query.search } } } } : {})
    }] } } },
    select: { id: true, attendanceId: true, kind: true, reason: true, originalValues: true, proposedChanges: true,
      status: true, reviewedBy: true, reviewedAt: true, resolutionRemarks: true, createdAt: true,
      attendance: { select: { id: true, businessDate: true, internship: include.attendance.include.internship } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
  }, query);
}

export async function correctionDetail(id, scope) {
  const record = await prisma.attendanceCorrection.findFirst({ where: { id, attendance: { internship: scope } }, include });
  if (!record) throw new NotFoundError('Correction request not found.');
  return record;
}

export function decideCorrection(id, status, remarks, actor, requestId) {
  return transaction(async (tx) => {
    const target = await tx.attendanceCorrection.findUnique({ where: { id }, include });
    if (!target) throw new NotFoundError('Correction request not found.');
    const ownerId = target.attendance.internship.userId;
    await lockUser(tx, ownerId);
    const current = await tx.attendanceCorrection.findUniqueOrThrow({ where: { id }, include });
    if (current.requestedBy === actor.id || ownerId === actor.id) {
      throw new AppError('You cannot approve your own correction.', 403, 'SELF_REVIEW_FORBIDDEN');
    }
    if (current.status !== 'PENDING') throw new AppError('The correction has already been reviewed.', 409, 'CORRECTION_STATE_CONFLICT');
    const now = new Date();
    const attendance = current.attendance;
    const date = attendance.businessDate;
    const where = dayIdentity(attendance.internshipId, date);
    let afterAttendance;
    if (status === 'APPROVED') {
      const report = await tx.dailyWorkReport.findUnique({ where });
      if (attendance.revision !== current.originalValues.revision
        || (report?.submittedAt?.toISOString() ?? null) !== current.originalValues.reportSubmittedAt) {
        throw new AppError('The original record changed. Reject this request and ask for a new proposal.', 409, 'CORRECTION_STALE');
      }
      const policy = await correctionWindow(tx, attendance.internship, date, current.kind, now, attendance);
      let changes = {};
      if (current.kind === 'TIMESTAMPS') {
        const periods = await tx.attendanceEligibility.findMany({ where: { internshipId: attendance.internshipId } });
        changes = { ...timestamps(timeChanges.parse(current.proposedChanges), attendance, date, policy, periods, now), source: 'CORRECTION' };
      } else {
        if (report?.submittedAt) throw new AppError('Submitted reports are preserved.', 409, 'REPORT_ALREADY_SUBMITTED');
        const data = { ...reportFields.parse(current.proposedChanges), status: 'SUBMITTED',
          submittedAt: current.createdAt, lateApprovedAt: now };
        await tx.dailyWorkReport.upsert({ where,
          create: { internshipId: attendance.internshipId, businessDate: date, ...data }, update: data });
      }
      const updated = await tx.attendance.update({ where: { id: attendance.id },
        data: { ...changes, revision: { increment: 1 } } });
      afterAttendance = { checkInAt: updated.checkInAt, checkOutAt: updated.checkOutAt, revision: updated.revision, source: updated.source };
    }
    const result = await tx.attendanceCorrection.update({ where: { id }, include, data: {
      status, reviewedBy: actor.id, reviewedAt: now, resolutionRemarks: remarks
    } });
    await auditService.createAuditLog(tx, { actorUserId: actor.id, requestId, resourceType: 'ATTENDANCE_CORRECTION',
      resourceId: id, action: `ATTENDANCE_CORRECTION_${status}`,
      beforeState: { status: current.status, ...current.originalValues },
      afterState: { status, kind: current.kind, attendanceId: attendance.id, ...afterAttendance } });
    return result;
  });
}
