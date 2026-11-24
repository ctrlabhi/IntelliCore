import { AppError } from '../../utils/errors.js';
import { businessToday, transaction } from '../../utils/phase04.js';
import { getPrismaClient } from '../../config/database.js';
import auditService from '../audit/auditService.js';

const minute = 60000;
const day = 24 * 60 * minute;
const prisma = getPrismaClient();

export const dayKey = (date) => date.toISOString().slice(0, 10);
export const addDays = (date, count) => new Date(+date + count * day);
export const indiaMidnight = (date) => new Date(+date - 330 * minute);

export function dateRange(from, to, maxDays = 31) {
  const count = (+to - +from) / day + 1;
  if (count < 1 || count > maxDays) {
    throw new AppError(`Choose a date range of 1 to ${maxDays} days.`, 400, 'INVALID_DATE_RANGE');
  }
  return Array.from({ length: count }, (_, index) => addDays(from, index));
}

function indiaTime(date, time) {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(+indiaMidnight(date) + (hours * 60 + minutes) * minute);
}

export function schedule(date, policy) {
  const open = indiaTime(date, policy.checkInTime);
  return {
    workingDay: policy.workingDays.includes(date.getUTCDay()),
    open, latestOnTime: new Date(+open + policy.graceMinutes * minute),
    close: indiaTime(date, policy.checkOutTime),
    reportDeadline: indiaTime(date, policy.reportDeadline)
  };
}

export function coversDate(period, date) {
  return period.firstDate <= date && period.lastDate >= date;
}

export function knownOnDate(period, date) {
  return coversDate(period, date) && period.startsAt < indiaMidnight(addDays(date, 1))
    && (!period.endsAt || period.endsAt > indiaMidnight(date));
}

export function spansShift(periods, date, shift) {
  let coveredThrough = shift.open;
  for (const period of periods.filter((period) => coversDate(period, date)).sort((a, b) => a.startsAt - b.startsAt)) {
    if (period.startsAt > coveredThrough) break;
    if (!period.endsAt || period.endsAt >= shift.close) return true;
    if (period.endsAt > coveredThrough) coveredThrough = period.endsAt;
  }
  return false;
}

export async function readPolicy(date, tx = prisma) {
  const policy = await tx.attendancePolicy.findFirst({
    where: { effectiveFrom: { lte: date } }, orderBy: { effectiveFrom: 'desc' }
  });
  if (!policy) throw new AppError('Attendance policy is unavailable for this date.', 503, 'ATTENDANCE_POLICY_UNAVAILABLE');
  return policy;
}

export async function policiesForDates(from, to, tx = prisma) {
  const [first, changes] = await Promise.all([
    readPolicy(from, tx),
    tx.attendancePolicy.findMany({ where: { effectiveFrom: { gt: from, lte: to } }, orderBy: { effectiveFrom: 'desc' } })
  ]);
  return (date) => changes.find((policy) => policy.effectiveFrom <= date) ?? first;
}

export function listPolicies() {
  return prisma.attendancePolicy.findMany({ orderBy: { effectiveFrom: 'desc' }, take: 100 });
}

export function publishPolicy(input, actor, requestId) {
  return transaction(async (tx) => {
    if (input.effectiveFrom <= businessToday()) {
      throw new AppError('A policy version must start on a future business date.', 409, 'POLICY_EFFECTIVE_DATE');
    }
    const policy = await tx.attendancePolicy.create({ data: { workingDays: [1, 2, 3, 4, 5], ...input } });
    await auditService.createAuditLog(tx, {
      actorUserId: actor.id, action: 'ATTENDANCE_POLICY_PUBLISHED', resourceType: 'ATTENDANCE_POLICY',
      resourceId: policy.id, requestId, afterState: policy
    });
    return policy;
  });
}

export function evaluateDay({ date, policy, now, periods = [], attendance, report, leave }) {
  const shift = schedule(date, policy);
  const known = periods.some((period) => knownOnDate(period, date));
  const obligation = spansShift(periods, date, shift);
  const checkedIn = Boolean(attendance?.checkInAt);
  const excused = Boolean(leave) || !shift.workingDay;
  const submitted = Boolean(report?.submittedAt);
  const pastShift = now > shift.close;
  const reportClosed = now >= shift.reportDeadline;
  const late = checkedIn && attendance.checkInAt > shift.latestOnTime;
  const early = Boolean(attendance?.checkOutAt && attendance.checkOutAt < shift.close);
  const requiresReport = !excused && policy.requiresDailyReport && (known || checkedIn);
  const flags = {
    isLate: late, lateMinutes: late ? Math.ceil((attendance.checkInAt - shift.latestOnTime) / minute) : 0,
    isEarlyDeparture: early,
    earlyDepartureMinutes: early ? Math.ceil((shift.close - attendance.checkOutAt) / minute) : 0,
    missingCheckOut: !excused && checkedIn && pastShift && !attendance.checkOutAt,
    missingDailyReport: (checkedIn || obligation) && requiresReport && reportClosed && !submitted
  };

  let state;
  let status = null;
  if (!known && !checkedIn && !leave && !report) state = 'NOT_ELIGIBLE';
  else if (!shift.workingDay) state = status = 'WEEKLY_OFF';
  else if (leave) state = status = 'ON_LEAVE';
  else if (attendance?.checkOutAt && (!requiresReport || submitted)) state = status = 'PRESENT';
  else if (checkedIn && ((pastShift && (submitted || !requiresReport || reportClosed))
      || (attendance.checkOutAt && reportClosed))) state = status = 'INCOMPLETE';
  else if (obligation && !checkedIn && pastShift) state = status = 'ABSENT';
  else if (now < shift.open) state = 'BEFORE_SHIFT';
  else if (checkedIn) state = attendance.checkOutAt || pastShift ? 'AWAITING_REPORT' : 'IN_PROGRESS';
  else state = pastShift ? 'CLOSED' : 'OPEN_SHIFT';

  return {
    id: attendance?.id ?? null, businessDate: dayKey(date), state, status,
    finalized: status !== null && (status !== 'ABSENT' || reportClosed),
    checkInAt: attendance?.checkInAt ?? null, checkOutAt: attendance?.checkOutAt ?? null,
    source: attendance?.source ?? null, ...flags, reportStatus: report?.status ?? null,
    reportRequired: requiresReport, reportReminder: requiresReport && checkedIn && !submitted,
    workingDay: shift.workingDay, opensAt: shift.open, closesAt: shift.close,
    reportDeadlineAt: shift.reportDeadline, policyId: policy.id
  };
}
