import { getPrismaClient } from '../../config/database.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { businessToday } from '../../utils/phase04.js';
import { addDays, dateRange, dayKey, evaluateDay, indiaMidnight, policiesForDates } from './attendancePolicy.js';
import { internshipIdentity } from './eligibility.js';
import { readDay } from './attendanceService.js';

const prisma = getPrismaClient();
const statuses = ['PRESENT', 'INCOMPLETE', 'ABSENT', 'ON_LEAVE', 'WEEKLY_OFF'];

export async function queryAttendance(query, scope, { all = false, now = new Date() } = {}) {
  const to = query.to ?? businessToday(now);
  const from = query.from ?? addDays(to, -6);
  const dates = dateRange(from, to);
  const range = { gte: from, lte: to };
  const periods = { firstDate: { lte: to }, lastDate: { gte: from },
    startsAt: { lt: indiaMidnight(addDays(to, 1)) }, OR: [{ endsAt: null }, { endsAt: { gt: indiaMidnight(from) } }] };
  const leaves = { status: 'APPROVED', startDate: { lte: to }, endDate: { gte: from } };
  const where = { AND: [scope, {
    id: query.internshipId, departmentId: query.departmentId,
    ...(query.search ? { OR: [
      { user: { profile: { fullName: { contains: query.search } } } },
      { internshipCode: { contains: query.search } }
    ] } : {})
  }, { OR: [
    { attendanceEligibility: { some: periods } },
    { attendanceRecords: { some: { businessDate: range } } },
    { dailyWorkReports: { some: { businessDate: range } } },
    { leaveRequests: { some: leaves } }
  ] }] };
  const total = await prisma.internship.count({ where });
  if (all && total > 250) {
    throw new AppError('Narrow the search or department to at most 250 enrollments.', 400, 'ATTENDANCE_RESULT_LIMIT');
  }
  const [selectPolicy, internships] = await Promise.all([
    policiesForDates(from, to),
    prisma.internship.findMany({
      where, skip: all ? 0 : (query.page - 1) * query.limit, take: all ? 251 : query.limit,
      orderBy: { id: 'asc' },
      select: {
        ...internshipIdentity,
        attendanceRecords: { where: { businessDate: range }, include: { policy: true } },
        attendanceEligibility: { where: periods },
        dailyWorkReports: { where: { businessDate: range }, select: { businessDate: true, submittedAt: true, status: true } },
        leaveRequests: { where: leaves, select: { startDate: true, endDate: true } }
      }
    })
  ]);
  if (all && internships.length > 250) {
    throw new AppError('Narrow the search or department to at most 250 enrollments.', 400, 'ATTENDANCE_RESULT_LIMIT');
  }
  const items = [];
  for (const { attendanceRecords, attendanceEligibility, dailyWorkReports, leaveRequests, ...internship } of internships) {
    const attendanceByDate = new Map(attendanceRecords.map((item) => [+item.businessDate, item]));
    const reportsByDate = new Map(dailyWorkReports.map((item) => [+item.businessDate, item]));
    for (const date of dates) {
      const attendance = attendanceByDate.get(+date);
      const summary = evaluateDay({
        date, now, periods: attendanceEligibility, attendance, policy: attendance?.policy ?? selectPolicy(date),
        leave: leaveRequests.some((item) => item.startDate <= date && date <= item.endDate),
        report: reportsByDate.get(+date)
      });
      if (summary.state === 'NOT_ELIGIBLE' || (query.status && summary.status !== query.status)) continue;
      items.push({ ...summary, internship });
    }
  }
  items.sort((a, b) => (query.sort === 'asc' ? a.businessDate.localeCompare(b.businessDate) : b.businessDate.localeCompare(a.businessDate))
    || a.internship.internshipCode.localeCompare(b.internship.internshipCode));
  return {
    items, from: dayKey(from), to: dayKey(to),
    pagination: { unit: 'internships', total, page: all ? 1 : query.page, limit: all ? 250 : query.limit,
      totalPages: Math.ceil(total / (all ? 250 : query.limit)) }
  };
}

export async function attendanceSummary(query, scope) {
  const { from, to, items } = await queryAttendance(query, scope, { all: true });
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  const flags = { isLate: 0, isEarlyDeparture: 0, missingCheckOut: 0, missingDailyReport: 0 };
  let open = 0;
  for (const record of items) {
    if (record.status) counts[record.status] += 1;
    else open += 1;
    for (const flag of Object.keys(flags)) if (record[flag]) flags[flag] += 1;
  }
  return { from, to, counts, flags, open };
}

export async function attendanceDetail(id, scope) {
  const record = await prisma.attendance.findFirst({
    where: { id, internship: scope }, include: { internship: { select: internshipIdentity } }
  });
  if (!record) throw new NotFoundError('Attendance record not found.');
  return readDay(prisma, record.internship, record.businessDate, new Date(), record);
}

function cell(value) {
  const text = String(value ?? '');
  const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export async function attendanceCsv(query, scope) {
  const { items } = await queryAttendance(query, scope, { all: true });
  const headings = ['date', 'internship', 'intern', 'department', 'status', 'check_in_utc', 'check_out_utc',
    'late', 'late_minutes', 'early_departure', 'early_departure_minutes', 'missing_checkout', 'missing_report'];
  return [headings.join(','), ...items.map((row) => [
    row.businessDate, row.internship.internshipCode, row.internship.user.profile?.fullName, row.internship.department.name,
    row.status ?? row.state, row.checkInAt?.toISOString(), row.checkOutAt?.toISOString(),
    row.isLate, row.lateMinutes, row.isEarlyDeparture, row.earlyDepartureMinutes, row.missingCheckOut, row.missingDailyReport
  ].map(cell).join(','))].join('\r\n') + '\r\n';
}
