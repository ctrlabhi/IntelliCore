import { getPrismaClient } from '../../config/database.js';
import auditService from '../audit/auditService.js';
import logger from '../../config/logger.js';
import env from '../../config/env.js';

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
      permissions: role.rolePermissions.map((rp) => ({
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
  async assignUserRoles(targetUserId, roleCodes, actor, requestId = null) {
    if (!Array.isArray(roleCodes) || roleCodes.length === 0) {
      const err = new Error('At least one role code must be provided.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }

    const actorRoles = actor.roles || [];
    const actorUserId = actor.user?.id || null;
    const isActorFounder = actorRoles.includes('FOUNDER');

    // HTTP Security Rule: Prohibit assigning FOUNDER role via API
    if (roleCodes.includes('FOUNDER')) {
      const err = new Error('Security policy violation: FOUNDER role cannot be assigned through the HTTP API. Use CLI bootstrap.');
      err.code = 'CANNOT_ASSIGN_FOUNDER_ROLE';
      err.status = 403;
      throw err;
    }

    // Privilege escalation guard: Only Founder can assign CO_FOUNDER or ADMIN
    const requiresFounderAuthority = roleCodes.some((rc) => ['CO_FOUNDER', 'ADMIN'].includes(rc));
    if (requiresFounderAuthority && !isActorFounder) {
      const err = new Error('Security policy violation: Only the primary Founder can assign Executive or Administrator roles.');
      err.code = 'FORBIDDEN_ELEVATED_ROLE_ASSIGNMENT';
      err.status = 403;
      throw err;
    }

    return await prisma.$transaction(async (tx) => {
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

      // Guardrail: Cannot revoke FOUNDER role from primary founder
      const targetHasFounderRole = targetUser.userRoles.some((ur) => ur.role.code === 'FOUNDER');
      const isConfiguredFounderEmail = env.FOUNDER_EMAIL && targetUser.email.toLowerCase() === env.FOUNDER_EMAIL.toLowerCase();

      if (targetHasFounderRole || isConfiguredFounderEmail) {
        // Ensure FOUNDER remains in assigned roles
        if (!roleCodes.includes('FOUNDER')) {
          roleCodes.push('FOUNDER');
        }
      }

      // 2. Fetch role records
      const rolesInDb = await tx.role.findMany({
        where: { code: { in: roleCodes } }
      });

      if (rolesInDb.length !== roleCodes.length) {
        const foundCodes = rolesInDb.map((r) => r.code);
        const missing = roleCodes.filter((c) => !foundCodes.includes(c));
        const err = new Error(`One or more roles do not exist: ${missing.join(', ')}`);
        err.code = 'INVALID_ROLES';
        err.status = 400;
        throw err;
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
        if (role.code === 'FOUNDER' && targetHasFounderRole) {
          continue; // keep existing Founder role record untouched
        }

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
    });
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
