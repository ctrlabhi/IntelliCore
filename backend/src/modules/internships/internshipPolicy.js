import { AppError, NotFoundError } from '../../utils/errors.js';
import { businessToday, lockUser } from '../../utils/phase04.js';

export const applicationStatuses = ['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN'];
export const editableApplications = ['DRAFT', 'CHANGES_REQUESTED'];
export const openApplications = [...editableApplications, 'PENDING_APPROVAL'];
export const activeEnrollments = ['APPROVED', 'ONGOING', 'COMPLETION_REVIEW'];
export const internshipStatuses = [...activeEnrollments, 'COMPLETED', 'TERMINATED', 'WITHDRAWN'];
export const reviewRoles = ['FOUNDER', 'CO_FOUNDER', 'HR_MANAGER'];
export const applicationReaderRoles = [...reviewRoles, 'ADMIN', 'HR_EXECUTIVE'];
export const internshipReaderRoles = [...applicationReaderRoles, 'OPERATIONS_EXECUTIVE'];

export function statusFilter(status, today = businessToday()) {
  if (status === 'APPROVED') {
    return { internshipStatus: { in: ['APPROVED', 'ONGOING'] }, commencementDate: { gt: today } };
  }
  if (status === 'ONGOING') {
    return { internshipStatus: { in: ['APPROVED', 'ONGOING'] }, commencementDate: { lte: today },
      expectedCompletionDate: { gte: today } };
  }
  if (status === 'COMPLETION_REVIEW') {
    return { OR: [
      { internshipStatus: 'COMPLETION_REVIEW' },
      { internshipStatus: { in: ['APPROVED', 'ONGOING'] }, expectedCompletionDate: { lt: today } }
    ] };
  }
  return status ? { internshipStatus: status } : {};
}

export function effectiveStatus(internship, today = businessToday()) {
  const { internshipStatus, commencementDate, expectedCompletionDate } = internship;
  if (!['APPROVED', 'ONGOING'].includes(internshipStatus)) return internshipStatus;
  if (expectedCompletionDate < today) return 'COMPLETION_REVIEW';
  return commencementDate <= today ? 'ONGOING' : 'APPROVED';
}

export async function assertTeamLeader(tx, userId, departmentId) {
  if (!userId) return;
  await lockUser(tx, userId);
  const membership = await tx.userDepartment.findFirst({
    where: { userId, departmentId, assignedRole: 'TEAM_LEADER', isActive: true, department: { isActive: true },
      user: { status: 'ACTIVE', staffProfile: { employmentStatus: 'ACTIVE' },
        userRoles: { some: { role: { code: 'TEAM_LEADER' } } } } },
    select: { id: true }
  });
  if (!membership) throw new AppError('Choose an active Team Leader assigned to this department.', 409, 'TEAM_LEADER_NOT_ELIGIBLE');
}

export async function assertNoOverlap(tx, { userId, commencementDate, expectedCompletionDate }, excludedId, { includeCompleted = false } = {}) {
  if (expectedCompletionDate < commencementDate) {
    throw new AppError('Completion date must be on or after commencement.', 400, 'INVALID_INTERNSHIP_DATES');
  }
  const overlap = await tx.internship.findFirst({
    where: {
      userId,
      ...(excludedId ? { id: { not: excludedId } } : {}),
      commencementDate: { lte: expectedCompletionDate },
      ...(includeCompleted ? { OR: [
        { internshipStatus: { in: activeEnrollments }, expectedCompletionDate: { gte: commencementDate } },
        { internshipStatus: 'COMPLETED', actualCompletionDate: { gte: commencementDate } }
      ] } : { internshipStatus: { in: activeEnrollments }, expectedCompletionDate: { gte: commencementDate } })
    },
    select: { id: true }
  });
  if (overlap) throw new AppError('This applicant already has an overlapping internship.', 409, 'INTERNSHIP_OVERLAP');
}

export function internshipScope(req) {
  if (req.user.status === 'ACTIVE' && req.permissions.includes('internships:read_all')
    && req.roles.some((role) => internshipReaderRoles.includes(role))) return {};
  const own = { userId: req.user.id };
  if (req.user.status !== 'ACTIVE' || !req.roles.includes('TEAM_LEADER')
    || !req.permissions.includes('internships:read_department')) return own;
  return { OR: [own, teamLeaderDepartmentScope(req.user.id)] };
}

export function teamLeaderDepartmentScope(userId) {
  return { department: { isActive: true, userDepartments: { some: {
    userId, assignedRole: 'TEAM_LEADER', isActive: true,
    user: { status: 'ACTIVE', staffProfile: { employmentStatus: 'ACTIVE' },
      userRoles: { some: { role: { code: 'TEAM_LEADER' } } } }
  } } } };
}

export function ensureFound(record, message) {
  if (!record) throw new NotFoundError(message);
  return record;
}
