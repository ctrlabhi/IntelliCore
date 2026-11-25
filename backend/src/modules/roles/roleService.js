import { getPrismaClient } from '../../config/database.js';
import auditService from '../audit/auditService.js';
import logger from '../../config/logger.js';
import { founderOnlyPermissions, isProtectedFounder } from '../../utils/founder.js';
import { AppError } from '../../utils/errors.js';
import { lockUser, transaction } from '../../utils/phase04.js';
import { syncAttendanceEligibility } from '../attendance/eligibility.js';
import { activeEnrollments, openApplications } from '../internships/internshipPolicy.js';

const prisma = getPrismaClient();

export class RoleService {
  /**
   * Retrieves all roles with assigned permissions count
   */
  async listRoles() {
    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            rolePermissions: true,
            userRoles: true
          }
        }
      }
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description,
      isSystemRole: r.isSystemRole,
      permissionsCount: r._count.rolePermissions,
      usersCount: r._count.userRoles
    }));
  }

  /**
   * Retrieves single role with all mapped permissions
   */
  async getRoleById(id) {
    const role = await prisma.role.findFirst({
      where: {
        OR: [{ id }, { code: id }]
      },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      }
    });

    if (!role) {
      const err = new Error('Role not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    return {
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      isSystemRole: role.isSystemRole,
      permissions: role.rolePermissions.filter(({ permission }) =>
        role.code === 'FOUNDER' || !founderOnlyPermissions.includes(permission.code)
      ).map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        description: rp.permission.description
      }))
    };
  }

  /**
   * Retrieves full catalog of permissions
   */
  async listPermissions() {
    return await prisma.permission.findMany({
      orderBy: { code: 'asc' }
    });
  }

  /**
   * Assigns roles to a user with strict privilege escalation guardrails.
   */
  async assignUserRoles(targetUserId, roleCodes, actor, requestId = null, client) {
    if (!Array.isArray(roleCodes) || roleCodes.length === 0) {
      const err = new Error('At least one role code must be provided.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }

    const actorUserId = actor.user?.id || null;

    // HTTP Security Rule: Prohibit assigning FOUNDER role via API
    if (roleCodes.includes('FOUNDER')) {
      const err = new Error('Security policy violation: FOUNDER role cannot be assigned through the HTTP API. Use CLI bootstrap.');
      err.code = 'CANNOT_ASSIGN_FOUNDER_ROLE';
      err.status = 403;
      throw err;
    }

    const assign = async (tx) => {
      await lockUser(tx, targetUserId);
      // 1. Fetch target user
      const targetUser = await tx.user.findUnique({
        where: { id: targetUserId },
        include: {
          userRoles: {
            include: { role: true }
          }
        }
      });

      if (!targetUser) {
        const err = new Error('Target user not found.');
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }

      if (isProtectedFounder(targetUser)) {
        throw new AppError('The primary Founder role assignments are protected.', 403, 'FOUNDER_ACCOUNT_PROTECTED');
      }

      // 2. Fetch role records
      const rolesInDb = await tx.role.findMany({
        where: { code: { in: roleCodes } }
      });
      if (rolesInDb.some(({ code }) => code === 'FOUNDER')) {
        throw new AppError('Founder assignment requires the administrative bootstrap.', 403, 'CANNOT_ASSIGN_FOUNDER_ROLE');
      }

      if (rolesInDb.length !== roleCodes.length) {
        const foundCodes = rolesInDb.map((r) => r.code);
        const missing = roleCodes.filter((c) => !foundCodes.includes(c));
        const err = new Error(`One or more roles do not exist: ${missing.join(', ')}`);
        err.code = 'INVALID_ROLES';
        err.status = 400;
        throw err;
      }
      if (rolesInDb.some(({ code }) => code !== 'INTERN')) {
        const application = await tx.internshipApplication.findFirst({
          where: { applicantUserId: targetUserId, applicationStatus: { in: openApplications } }, select: { id: true }
        });
        const enrollment = await tx.internship.findFirst({
          where: { userId: targetUserId, internshipStatus: { in: activeEnrollments } }, select: { id: true }
        });
        if (application || enrollment) {
          throw new AppError('Resolve the active internship or application before assigning staff roles.', 409, 'INTERNSHIP_ACCOUNT_CONFLICT');
        }
      }

      const beforeRoles = targetUser.userRoles.map((ur) => ur.role.code);

      // 3. Clear existing non-founder roles and apply new roles
      await tx.userRole.deleteMany({
        where: {
          userId: targetUserId,
          role: {
            code: { not: 'FOUNDER' }
          }
        }
      });

      for (const role of rolesInDb) {
        await tx.userRole.upsert({
          where: {
            userId_roleId: {
              userId: targetUserId,
              roleId: role.id
            }
          },
          update: {
            assignedBy: actorUserId,
            assignedAt: new Date()
          },
          create: {
            userId: targetUserId,
            roleId: role.id,
            assignedBy: actorUserId
          }
        });
      }

      await syncAttendanceEligibility(tx, targetUserId);

      // 4. Audit Log
      await auditService.createAuditLog(tx, {
        actorUserId,
        action: 'USER_ROLES_UPDATED',
        resourceType: 'USER_ROLE',
        resourceId: targetUserId,
        beforeState: { roles: beforeRoles },
        afterState: { roles: roleCodes },
        requestId,
        result: 'SUCCESS'
      });

      logger.info({ targetUserId, actorUserId, roles: roleCodes }, 'User roles updated');

      return rolesInDb.map((r) => ({ code: r.code, name: r.name }));
    };
    return client ? assign(client) : transaction(assign);
  }

  /**
   * Modifies permissions assigned to a non-protected role.
   */
  async updateRolePermissions(roleId, permissionCodes, actorUserId, requestId = null) {
    if (!Array.isArray(permissionCodes)) {
      const err = new Error('Permission codes must be an array.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }

    return await prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: { OR: [{ id: roleId }, { code: roleId }] },
        include: {
          rolePermissions: {
            include: { permission: true }
          }
        }
      });

      if (!role) {
        const err = new Error('Role not found.');
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }

      // Immutability Guard: FOUNDER permissions are hard-coded system protections
      if (['FOUNDER', 'CO_FOUNDER'].includes(role.code)) {
        const err = new Error(`Permissions for system role ${role.code} are protected and immutable.`);
        err.code = 'IMMUTABLE_ROLE_PERMISSIONS';
        err.status = 403;
        throw err;
      }

      const permissionsInDb = await tx.permission.findMany({
        where: { code: { in: permissionCodes } }
      });
      if (permissionsInDb.some(({ code }) => founderOnlyPermissions.includes(code))) {
        throw new AppError('Founder-only permissions cannot be delegated.', 403, 'FOUNDER_PERMISSION_PROTECTED');
      }

      if (permissionsInDb.length !== permissionCodes.length) {
        const found = permissionsInDb.map((p) => p.code);
        const missing = permissionCodes.filter((c) => !found.includes(c));
        const err = new Error(`Unknown permission codes: ${missing.join(', ')}`);
        err.code = 'INVALID_PERMISSIONS';
        err.status = 400;
        throw err;
      }

      const beforeCodes = role.rolePermissions.map((rp) => rp.permission.code);

      // Replace permissions
      await tx.rolePermission.deleteMany({
        where: { roleId: role.id }
      });

      for (const perm of permissionsInDb) {
        await tx.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: perm.id
          }
        });
      }

      await auditService.createAuditLog(tx, {
        actorUserId,
        action: 'ROLE_PERMISSIONS_UPDATED',
        resourceType: 'ROLE_PERMISSION',
        resourceId: role.id,
        beforeState: { roleCode: role.code, permissions: beforeCodes },
        afterState: { roleCode: role.code, permissions: permissionCodes },
        requestId,
        result: 'SUCCESS'
      });

      return {
        roleId: role.id,
        roleCode: role.code,
        permissions: permissionsInDb.map((p) => p.code)
      };
    });
  }
}

export default new RoleService();
