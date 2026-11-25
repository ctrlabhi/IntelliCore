import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { teamLeaderDepartmentScope } from '../internships/internshipPolicy.js';
import { eligibleAudienceWhere } from '../notifications/announcementService.js';
import { eligibleWhere } from '../work/workAccess.js';

const globalRoles = ['FOUNDER', 'CO_FOUNDER', 'ADMIN'];
export const organizationMeetings = (req) => req.permissions.includes('meetings:manage_all')
  && req.roles.some((role) => globalRoles.includes(role));

export function meetingScope(req) {
  if (organizationMeetings(req)) return {};
  const clauses = [];
  if (req.roles.includes('HR_MANAGER') && req.permissions.includes('meetings:manage_hr')) {
    clauses.push({ organizerId: req.user.id, audienceType: { in: ['INTERNS', 'DEPARTMENT'] } });
  }
  if (req.roles.includes('OPERATIONS_EXECUTIVE') && req.permissions.includes('meetings:manage_operations')) {
    clauses.push({ organizerId: req.user.id, audienceType: { in: ['STAFF', 'DEPARTMENT'] } });
  }
  if (req.roles.includes('TEAM_LEADER') && req.permissions.includes('meetings:manage_department')) {
    clauses.push({ audienceType: 'DEPARTMENT', ...teamLeaderDepartmentScope(req.user.id) });
  }
  if (!clauses.length) throw new ForbiddenError();
  return { OR: clauses };
}

export async function verifyMeetingScope(client, req, meeting) {
  if (meeting.departmentId && !await client.department.count({ where: { id: meeting.departmentId, isActive: true } })) {
    throw new NotFoundError('Active department not found.');
  }
  const scope = meetingScope(req);
  if (!scope.OR) return;
  for (const clause of scope.OR) {
    const audience = clause.audienceType;
    if (clause.organizerId && clause.organizerId !== meeting.organizerId) continue;
    if (typeof audience === 'string' ? audience !== meeting.audienceType : !audience.in.includes(meeting.audienceType)) continue;
    if (!clause.department || await client.department.count({ where: { id: meeting.departmentId, ...clause.department } })) return;
  }
  throw new ForbiddenError('Meeting audience exceeds current authorization.');
}

export async function ownMeetingScope(client, userId, now) {
  const [internships, staff] = await Promise.all([
    client.internship.findMany({ where: { ...eligibleWhere(now), userId }, select: { departmentId: true } }),
    client.staffProfile.findFirst({ where: { userId, employmentStatus: 'ACTIVE' },
      select: { user: { select: { userDepartments: { where: { isActive: true, department: { isActive: true } },
        select: { departmentId: true } } } } } })
  ]);
  const departments = [...new Set([...internships, ...(staff?.user.userDepartments ?? [])].map(({ departmentId }) => departmentId))];
  return { participants: { some: { userId, revokedAt: null } }, OR: [
    { status: { in: ['COMPLETED', 'CANCELLED'] } },
    { status: 'SCHEDULED', endAt: { lte: now } },
    { status: 'SCHEDULED', audienceType: { in: ['ALL_ACTIVE_USERS', 'SELECTED_USERS', ...(staff ? ['STAFF'] : []),
      ...(internships.length ? ['INTERNS'] : [])] } },
    { status: 'SCHEDULED', audienceType: 'DEPARTMENT', departmentId: { in: departments } }
  ] };
}

export const meetingAudience = (meeting, now) =>
  eligibleAudienceWhere({ ...meeting, selectedUsers: meeting.selectedUserIds }, now);

export async function eligibleParticipant(client, meeting, userId, now) {
  return Boolean(await client.user.count({ where: { AND: [{ id: userId }, meetingAudience(meeting, now)] } }));
}
