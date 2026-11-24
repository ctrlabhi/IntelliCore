import { AppError, NotFoundError } from '../../utils/errors.js';
import { businessToday } from '../../utils/phase04.js';
import { coversDate, knownOnDate } from './attendancePolicy.js';

export const eligibleEnrollmentStates = ['APPROVED', 'ONGOING'];
export const internAccount = {
  status: 'ACTIVE', emailVerified: true, staffProfile: null,
  userRoles: { some: { role: { code: 'INTERN' } }, every: { role: { code: 'INTERN' } } }
};

export const internshipIdentity = {
  id: true, userId: true, internshipCode: true, commencementDate: true, expectedCompletionDate: true,
  department: { select: { id: true, name: true, code: true } },
  user: { select: { profile: { select: { fullName: true } } } }
};

export function eligibleInternship(tx, userId, today) {
  return tx.internship.findFirst({
    where: {
      userId, user: internAccount, internshipStatus: { in: eligibleEnrollmentStates },
      commencementDate: { lte: today }, expectedCompletionDate: { gte: today }
    },
    select: internshipIdentity, orderBy: [{ commencementDate: 'desc' }, { id: 'asc' }]
  });
}

// Call under the same user row lock used by attendance and enrollment. Closed periods are immutable.
export async function syncAttendanceEligibility(tx, userId, now = new Date()) {
  const eligible = await tx.internship.findMany({
    where: { userId, user: internAccount, internshipStatus: { in: eligibleEnrollmentStates },
      expectedCompletionDate: { gte: businessToday(now) } },
    select: { id: true, commencementDate: true, expectedCompletionDate: true }
  });
  const previous = await tx.attendanceEligibility.findMany({ where: { internship: { userId }, endsAt: null } });
  const wanted = new Map(eligible.map((item) => [item.id, item]));
  const close = [];
  for (const period of previous) {
    const current = wanted.get(period.internshipId);
    if (current && +current.commencementDate === +period.firstDate && +current.expectedCompletionDate === +period.lastDate) {
      wanted.delete(period.internshipId);
    } else {
      close.push(period.id);
    }
  }
  if (close.length) {
    await tx.attendanceEligibility.updateMany({ where: { id: { in: close } }, data: { endsAt: now } });
  }
  if (wanted.size) {
    await tx.attendanceEligibility.createMany({ data: [...wanted.values()].map((item) => ({
      internshipId: item.id, startsAt: now, firstDate: item.commencementDate, lastDate: item.expectedCompletionDate
    })) });
  }
}

export async function ownedHistoricalDate(tx, userId, internshipId, date) {
  const internship = await tx.internship.findFirst({
    where: { id: internshipId, userId, user: internAccount },
    select: { ...internshipIdentity, internshipStatus: true, attendanceEligibility: true }
  });
  if (!internship) throw new NotFoundError('Internship not found.');
  if (!internship.attendanceEligibility.some((period) => knownOnDate(period, date))) {
    throw new AppError('Attendance eligibility is unavailable for that business date.', 409, 'DATE_NOT_ELIGIBLE');
  }
  return internship;
}

export function eligibleForLeave(internship, date, today) {
  if (date <= today) return internship.attendanceEligibility.some((period) => knownOnDate(period, date));
  return eligibleEnrollmentStates.includes(internship.internshipStatus)
    && internship.attendanceEligibility.some((period) => !period.endsAt && coversDate(period, date));
}
