import { ForbiddenError } from '../../utils/errors.js';
import { effectivePermissions, matchesFounderIdentity } from '../../utils/founder.js';
import { teamLeaderDepartmentScope } from '../internships/internshipPolicy.js';

export const notificationPermissions = [
  ['notifications:own', 'Read and manage own notifications and preferences'],
  ['announcements:manage_all', 'Manage announcements within organization audience ceiling'],
  ['announcements:manage_interns', 'Manage announcements for eligible interns'],
  ['announcements:manage_operations', 'Manage staff or departmental operations announcements'],
  ['announcements:manage_department', 'Manage announcements within assigned departments'],
  ['notifications:admin', 'View sanitized notification worker and outbox diagnostics'],
  ['notifications:operate', 'Retry or cancel permitted email jobs'],
  ['tasks:amend_score', 'Amend a recorded approval score within technical review scope'],
  ['learning:correct_progress', 'Correct observed lesson progress within curriculum scope']
].map(([code, description]) => ({ code, description }));

const correctionGrants = ['tasks:amend_score', 'learning:correct_progress'];
export const assessmentGrants = { FOUNDER: correctionGrants, CO_FOUNDER: correctionGrants, TEAM_LEADER: correctionGrants };
export const notificationGrants = {
  FOUNDER: ['announcements:manage_all', 'notifications:admin', 'notifications:operate'],
  CO_FOUNDER: ['announcements:manage_all'],
  HR_MANAGER: ['announcements:manage_interns'],
  OPERATIONS_EXECUTIVE: ['announcements:manage_operations'],
  TEAM_LEADER: ['announcements:manage_department']
};

export function announcementScope(req) {
  const roles = req.roles;
  const permissions = req.permissions;
  if (roles.some((role) => ['FOUNDER', 'CO_FOUNDER', 'ADMIN'].includes(role)) && permissions.includes('announcements:manage_all')) {
    return {};
  }
  const policies = [];
  if (roles.includes('HR_MANAGER') && permissions.includes('announcements:manage_interns')) {
    policies.push({ audienceType: { in: ['INTERNS', 'DEPARTMENT'] } });
  }
  if (roles.includes('OPERATIONS_EXECUTIVE') && permissions.includes('announcements:manage_operations')) {
    policies.push({ audienceType: { in: ['STAFF', 'DEPARTMENT'] } });
  }
  if (roles.includes('TEAM_LEADER') && permissions.includes('announcements:manage_department')) {
    policies.push({ ...teamLeaderDepartmentScope(req.user.id), audienceType: 'DEPARTMENT' });
  }
  if (!policies.length) throw new ForbiddenError();
  return { OR: policies };
}

export function canSelectPeople(req) {
  return Object.keys(announcementScope(req)).length === 0;
}

export async function currentActor(tx, id) {
  const user = await tx.user.findUnique({ where: { id }, include: { userRoles: {
    include: { role: { include: { rolePermissions: { include: { permission: true } } } } }
  } } });
  if (user?.status !== 'ACTIVE' || !user.emailVerified) throw new ForbiddenError();
  const roles = user.userRoles.map(({ role }) => role.code);
  const permissions = effectivePermissions(new Set(user.userRoles.flatMap(({ role }) =>
    role.rolePermissions.map(({ permission }) => permission.code))), roles, user);
  return { user, roles, permissions };
}

export function assertEmailAdministration(req, mutate = false) {
  const primary = req.roles.includes('FOUNDER') && matchesFounderIdentity(req.user);
  if (!(primary || (!mutate && req.roles.includes('ADMIN')))
      || !req.permissions.includes(mutate ? 'notifications:operate' : 'notifications:admin')) throw new ForbiddenError();
}
