
import { Prisma } from '@prisma/client';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { businessToday, lockDepartment } from '../../utils/phase04.js';
import { eligibleEnrollmentStates, internAccount, internshipIdentity } from '../attendance/eligibility.js';
import auditService from '../audit/auditService.js';
import { teamLeaderDepartmentScope } from '../internships/internshipPolicy.js';

const monitors = ['FOUNDER', 'CO_FOUNDER', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'OPERATIONS_EXECUTIVE'];
const taskManagers = ['FOUNDER', 'CO_FOUNDER', 'OPERATIONS_EXECUTIVE'];
const technicalRoles = ['FOUNDER', 'CO_FOUNDER'];
const rolesByCapability = {
  'tasks:read': monitors,
  'tasks:manage': taskManagers,
  'tasks:review': technicalRoles,
  'learning:read': monitors,
  'learning:manage': technicalRoles,
  'performance:read': monitors
};

export const workPermissions = Object.keys(rolesByCapability).flatMap((permission) => [
  { code: permission + '_all', description: 'Organization scope for ' + permission },
  { code: permission + '_department', description: 'Assigned department scope for ' + permission }
]).concat([
  { code: 'tasks:own', description: 'Participate in own task assignments' },
  { code: 'learning:own', description: 'Access own learning enrollments and progress' },
  { code: 'performance:own', description: 'View own internship performance' },
  { code: 'performance:feedback', description: 'View recorded review scores and feedback within reporting scope' }
]);

export const workGrants = Object.fromEntries([...monitors, 'TEAM_LEADER', 'INTERN'].map((role) => {
  const grants = Object.entries(rolesByCapability).flatMap(([capability, roles]) => {
    if (role === 'TEAM_LEADER') return [capability + '_department'];
    return roles.includes(role) ? [capability + '_all'] : [];
  });
  if (['FOUNDER', 'CO_FOUNDER', 'HR_MANAGER', 'TEAM_LEADER'].includes(role)) grants.push('performance:feedback');
  if (role === 'INTERN') grants.push('tasks:own', 'learning:own', 'performance:own');
  return [role, grants];
}));

export function scope(req, capability) {
  if (req.permissions.includes(capability + '_all')
      && req.roles.some((role) => rolesByCapability[capability].includes(role))) return {};
  if (req.roles.includes('TEAM_LEADER') && req.permissions.includes(capability + '_department')) {
    return teamLeaderDepartmentScope(req.user.id);
  }
  throw new ForbiddenError();
}

export function can(req, capability) {
  try {
    scope(req, capability);
    return true;
  } catch (error) {
    if (error instanceof ForbiddenError) return false;
    throw error;
  }
}

export const isIntern = (req) => req.roles.length === 1 && req.roles[0] === 'INTERN';

export function own(req, domain) {
  if (!isIntern(req) || !req.permissions.includes(domain + ':own')) throw new ForbiddenError();
  return req.user.id;
}

export async function activeDepartment(tx, id, where) {
  await lockDepartment(tx, id);
  const found = await tx.department.findFirst({ where: { id, ...where.department, isActive: true } });
  if (!found) throw new NotFoundError('Active department not found.');
  return found;
}

export function eligibleWhere(now = new Date()) {
  const date = businessToday(now);
  return { user: internAccount, department: { isActive: true }, internshipStatus: { in: eligibleEnrollmentStates },
    commencementDate: { lte: date }, expectedCompletionDate: { gte: date } };
}

export function historicalWhere(userId, now = new Date()) {
  return { userId, user: internAccount, OR: [eligibleWhere(now),
    { internshipStatus: { in: ['COMPLETION_REVIEW', 'COMPLETED'] } },
    { internshipStatus: { in: eligibleEnrollmentStates }, expectedCompletionDate: { lt: businessToday(now) } }
  ] };
}

export async function lockUsers(tx, ids) {
  const unique = [...new Set(ids)].sort();
  if (unique.length) {
    await tx.$queryRaw`SELECT id FROM users WHERE id IN (${Prisma.join(unique)}) ORDER BY id FOR UPDATE`;
  }
}

export const person = internshipIdentity;
export const conflict = (message, code = 'INVALID_WORK_STATE') => new AppError(message, 409, code);
export const missing = (label) => new NotFoundError(label + ' not found.');

export function found(record, label) {
  if (!record) throw missing(label);
  return record;
}

export function audit(tx, req, requestId, action, resourceType, resourceId, afterState, beforeState) {
  return auditService.createAuditLog(tx, {
    actorUserId: req?.user.id, requestId, action, resourceType, resourceId, afterState, beforeState
  });
}
