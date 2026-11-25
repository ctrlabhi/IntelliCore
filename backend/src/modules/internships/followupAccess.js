import { ForbiddenError } from '../../utils/errors.js';
import { matchesFounderIdentity } from '../../utils/founder.js';
import { teamLeaderDepartmentScope } from './internshipPolicy.js';

export const primaryFounder = (req) => req.roles.includes('FOUNDER') && matchesFounderIdentity(req.user);

export function assertFollowupManager(req) {
  if (!req.permissions.includes('internships:manage_followups')
      || !(primaryFounder(req) || req.roles.includes('HR_MANAGER'))) throw new ForbiddenError();
}

export function followupScope(req, certificate = false) {
  if (req.permissions.includes('internships:read_followups')
      && (primaryFounder(req) || req.roles.some((role) => ['HR_MANAGER', 'HR_EXECUTIVE'].includes(role)))) return {};
  const own = { userId: req.user.id };
  if (!certificate && req.roles.includes('TEAM_LEADER') && req.permissions.includes('internships:read_department')) {
    return { OR: [own, teamLeaderDepartmentScope(req.user.id)] };
  }
  return own;
}
