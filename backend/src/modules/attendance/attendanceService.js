import { getPrismaClient } from '../../config/database.js';
import { ForbiddenError } from '../../utils/errors.js';
import { businessToday, lockUser, transaction } from '../../utils/phase04.js';
import { addDays, evaluateDay, indiaMidnight, readPolicy, schedule } from './attendancePolicy.js';
import { eligibleInternship, internshipIdentity, internAccount, syncAttendanceEligibility } from './eligibility.js';

const prisma = getPrismaClient();

export function dayIdentity(internshipId, businessDate) {
  return { internshipId_businessDate: { internshipId, businessDate } };
}

export function approvedLeave(internshipId, date, tx = prisma) {
  return tx.leaveRequest.findFirst({
    where: { internshipId, status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true }
  });
}

export async function readDay(tx, internship, date, now, record) {
  const policy = await readPolicy(date, tx);
  if (!internship) return evaluateDay({ date, now, policy });
  const where = dayIdentity(internship.id, date);
  const [attendance, report, leave, periods] = await Promise.all([
    record ?? tx.attendance.findUnique({ where }),
    tx.dailyWorkReport.findUnique({ where, select: { submittedAt: true, status: true } }),
    approvedLeave(internship.id, date, tx),
    tx.attendanceEligibility.findMany({
      where: { internshipId: internship.id, firstDate: { lte: date }, lastDate: { gte: date },
        startsAt: { lt: indiaMidnight(addDays(date, 1)) },
        OR: [{ endsAt: null }, { endsAt: { gt: indiaMidnight(date) } }] }
    })
  ]);
  const fixedPolicy = attendance?.policyId && attendance.policyId !== policy.id
    ? await tx.attendancePolicy.findUniqueOrThrow({ where: { id: attendance.policyId } })
    : policy;
  return { ...evaluateDay({ date, now, policy: fixedPolicy, attendance, report, leave, periods }), internship };
}

async function todayRecorded(tx, userId, date) {
  return tx.attendance.findFirst({
    where: { businessDate: date, checkInAt: { not: null }, internship: { userId } },
    include: { internship: { select: internshipIdentity } },
    orderBy: [{ checkInAt: 'desc' }, { id: 'asc' }]
  });
}

export async function todayAttendance(userId, now = new Date()) {
  const date = businessToday(now);
  const existing = await todayRecorded(prisma, userId, date);
  const internship = existing?.internship ?? await eligibleInternship(prisma, userId, date);
  return { ...await readDay(prisma, internship, date, now, existing), serverTime: now };
}

export function recordCheckIn(userId, readClock = () => new Date()) {
  return transaction(async (tx) => {
    await lockUser(tx, userId);
    const now = readClock();
    const date = businessToday(now);
    const internship = await eligibleInternship(tx, userId, date);
    if (!internship) {
      const previous = await todayRecorded(tx, userId, date);
      return { ...await readDay(tx, previous?.internship, date, now, previous), serverTime: now };
    }

    const current = await tx.attendance.findUnique({ where: dayIdentity(internship.id, date) });
    const policy = await readPolicy(date, tx);
    const shift = schedule(date, policy);
    const leave = await approvedLeave(internship.id, date, tx);
    let updated = current;
    let recorded = false;
    if (!current?.checkInAt && shift.workingDay && !leave && now >= shift.open && now <= shift.close) {
      await syncAttendanceEligibility(tx, userId, now);
      updated = await tx.attendance.upsert({
        where: dayIdentity(internship.id, date),
        create: { internshipId: internship.id, businessDate: date, policyId: policy.id, checkInAt: now },
        update: { checkInAt: now, source: 'DASHBOARD', revision: { increment: 1 } }
      });
      recorded = true;
    }
    const summary = await readDay(tx, internship, date, now, updated);
    return { ...summary, recorded, serverTime: now,
      nextCheckInAt: !current?.checkInAt && !leave && shift.workingDay && now < shift.open ? shift.open : null };
  }, { retryUnique: true });
}

export function recordCheckOut(userId, readClock = () => new Date()) {
  return transaction(async (tx) => {
    await lockUser(tx, userId);
    const account = await tx.user.findFirst({ where: { ...internAccount, id: userId }, select: { id: true } });
    if (!account) throw new ForbiddenError('This account is ineligible for attendance checkout.');
    const now = readClock();
    const date = businessToday(now);
    const current = await todayRecorded(tx, userId, date);
    if (!current) return { ...await readDay(tx, await eligibleInternship(tx, userId, date), date, now), recorded: false };
    const recorded = !current.checkOutAt && now >= current.checkInAt;
    const updated = recorded ? await tx.attendance.update({
      where: { id: current.id }, data: { checkOutAt: now, revision: { increment: 1 } }
    }) : current;
    return { ...await readDay(tx, current.internship, date, now, updated), recorded };
  });
}
