import { getPrismaClient } from '../../config/database.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { lockDepartment, lockUser, readPage, requireActiveDepartment, transaction } from '../../utils/phase04.js';
import auditService from '../audit/auditService.js';

const prisma = getPrismaClient();
export const departmentSummary = {
  id: true, name: true, code: true, slug: true, description: true
};
const departmentSelect = { ...departmentSummary, isActive: true, createdAt: true, updatedAt: true };
const membershipSelect = {
  id: true, assignedRole: true, isActive: true, assignedAt: true,
  user: { select: { id: true, profile: { select: { fullName: true } },
    staffProfile: { select: { staffCode: true, designation: true } } } }
};

export function listDepartments(query, includeInactive, assignedLeaderId) {
  const where = {
    ...(!includeInactive ? { isActive: true } : {}),
    ...(assignedLeaderId ? { userDepartments: { some: {
      userId: assignedLeaderId, assignedRole: 'TEAM_LEADER', isActive: true,
      user: { status: 'ACTIVE', staffProfile: { employmentStatus: 'ACTIVE' },
        userRoles: { some: { role: { code: 'TEAM_LEADER' } } } }
    } } } : {}),
    ...(query.search ? { OR: [{ name: { contains: query.search } }, { code: { contains: query.search } }] } : {})
  };
  return readPage(prisma.department, {
    where, select: includeInactive ? departmentSelect : departmentSummary, orderBy: [{ name: 'asc' }, { id: 'asc' }]
  }, query);
}

export async function getDepartment(id, includeInactive) {
  const department = await prisma.department.findFirst({
    where: { id, ...(!includeInactive ? { isActive: true } : {}) },
    select: includeInactive ? departmentSelect : departmentSummary
  });
  if (!department) throw new NotFoundError('Department not found.');
  return department;
}

export function saveDepartment(id, data, actor, requestId) {
  return transaction(async (tx) => {
    if (id) await lockDepartment(tx, id);
    const beforeState = id && await tx.department.findUnique({ where: { id }, select: departmentSelect });
    if (id && !beforeState) throw new NotFoundError('Department not found.');
    const updated = id
      ? await tx.department.update({ where: { id }, data, select: departmentSelect })
      : await tx.department.create({ data: { ...data, createdBy: actor.id }, select: departmentSelect });
    await auditService.createAuditLog(tx, {
      actorUserId: actor.id, requestId, resourceType: 'DEPARTMENT', resourceId: updated.id,
      action: !id ? 'DEPARTMENT_CREATED' : 'isActive' in data ? 'DEPARTMENT_STATUS_CHANGED' : 'DEPARTMENT_UPDATED',
      beforeState: beforeState || null, afterState: updated
    });
    return updated;
  });
}

export async function listStaffAssignments(departmentId, query, teamLeadersOnly) {
  await getDepartment(departmentId, !teamLeadersOnly);
  return readPage(prisma.userDepartment, {
    where: {
      departmentId,
      ...(teamLeadersOnly ? { assignedRole: 'TEAM_LEADER', isActive: true } : {}),
      user: {
        ...(teamLeadersOnly ? { status: 'ACTIVE', staffProfile: { employmentStatus: 'ACTIVE' },
          userRoles: { some: { role: { code: 'TEAM_LEADER' } } } } : {}),
        ...(query.search ? { profile: { fullName: { contains: query.search } } } : {})
      }
    },
    select: membershipSelect, orderBy: [{ assignedAt: 'desc' }, { id: 'asc' }]
  }, query);
}

export function saveStaffAssignment(departmentId, { userId, assignedRole, isActive }, actor, requestId) {
  return transaction(async (tx) => {
    await lockUser(tx, userId);
    await lockDepartment(tx, departmentId);
    if (isActive) await requireActiveDepartment(tx, departmentId);
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { staffProfile: true, userRoles: { include: { role: true } } }
    });
    const key = { userId, departmentId, assignedRole };
    const beforeState = await tx.userDepartment.findUnique({ where: { userId_departmentId_assignedRole: key } });
    if (!isActive && !beforeState) throw new NotFoundError('Department assignment not found.');
    if (isActive && (user?.status !== 'ACTIVE' || user.staffProfile?.employmentStatus !== 'ACTIVE'
      || (assignedRole === 'TEAM_LEADER' && !user.userRoles.some(({ role }) => role.code === 'TEAM_LEADER')))) {
      throw new AppError('Choose an eligible active staff member for this assignment.', 409, 'STAFF_NOT_ELIGIBLE');
    }
    // Preserve previous rows when membership changes capacity or is deactivated.
    if (isActive) {
      await tx.userDepartment.updateMany({ where: { userId, departmentId, assignedRole: { not: assignedRole } },
        data: { isActive: false } });
    }
    const assignment = await tx.userDepartment.upsert({
      where: { userId_departmentId_assignedRole: key },
      create: { ...key, isActive, assignedBy: actor.id },
      update: { isActive, assignedBy: actor.id, assignedAt: new Date() },
      select: membershipSelect
    });
    await auditService.createAuditLog(tx, {
      actorUserId: actor.id, requestId, resourceType: 'USER_DEPARTMENT', resourceId: assignment.id,
      action: 'DEPARTMENT_ASSIGNMENT_UPDATED', beforeState: beforeState && { isActive: beforeState.isActive },
      afterState: { ...key, isActive }
    });
    return assignment;
  });
}
