import { ForbiddenError } from '../../utils/errors.js';
import { requirePermission, requireRole } from '../../middleware/auth.js';
import { teamLeaderDepartmentScope } from '../internships/internshipPolicy.js';

export const organizationRoles = ['FOUNDER', 'CO_FOUNDER', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'OPERATIONS_EXECUTIVE'];
export const reviewRoles = ['FOUNDER', 'HR_MANAGER'];
export const canReview = (permission) => [requireRole(...reviewRoles), requirePermission(permission)];

export function ownScope(req) {
  if (req.roles.length !== 1 || req.roles[0] !== 'INTERN') throw new ForbiddenError('An intern account is required.');
  return { userId: req.user.id };
}

export function readership(req, domain) {
  if (req.roles.some((role) => organizationRoles.includes(role)) && req.permissions.includes(`${domain}:read_all`)) return {};
  if (req.roles.includes('TEAM_LEADER') && req.permissions.includes(`${domain}:read_department`)) {
    return teamLeaderDepartmentScope(req.user.id);
  }
  throw new ForbiddenError();
}
