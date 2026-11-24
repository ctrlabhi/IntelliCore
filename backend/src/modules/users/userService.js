import { getPrismaClient } from '../../config/database.js';
import auditService from '../audit/auditService.js';
import logger from '../../config/logger.js';
import env from '../../config/env.js';

const prisma = getPrismaClient();

export class UserService {
  /**
   * Retrieves paginated users list with optional search, role, and status filters.
   */
  async listUsers({ page = 1, limit = 20, search = '', status = '', role = '' } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = {};

    if (status) {
      where.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { email: { contains: q } },
        { profile: { fullName: { contains: q } } },
        { profile: { displayName: { contains: q } } }
      ];
    }

    if (role && role.trim()) {
      where.userRoles = {
        some: {
          role: {
            code: role.trim()
          }
        }
      };
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          profile: true,
          staffProfile: true,
          userRoles: {
            include: {
              role: true
            }
          }
        }
      })
    ]);

    const formattedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      profile: user.profile
        ? {
            fullName: user.profile.fullName,
            displayName: user.profile.displayName,
            profilePhotoUrl: user.profile.profilePhotoUrl
          }
        : null,
      isStaff: Boolean(user.staffProfile),
      staffProfile: user.staffProfile
        ? {
            staffCode: user.staffProfile.staffCode,
            designation: user.staffProfile.designation,
            employmentStatus: user.staffProfile.employmentStatus
          }
        : null,
      roles: user.userRoles.map((ur) => ({
        code: ur.role.code,
        name: ur.role.name
      }))
    }));

    return {
      users: formattedUsers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * Retrieves single user by UUID.
   */
  async getUserById(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        staffProfile: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!user) {
      const err = new Error('User not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const permissions = new Set();
    user.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        if (rp.permission?.code) permissions.add(rp.permission.code);
      });
    });

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      profile: user.profile
        ? {
            fullName: user.profile.fullName,
            displayName: user.profile.displayName,
            profilePhotoUrl: user.profile.profilePhotoUrl
          }
        : null,
      isStaff: Boolean(user.staffProfile),
      staffProfile: user.staffProfile,
      roles: user.userRoles.map((ur) => ({
        code: ur.role.code,
        name: ur.role.name,
        description: ur.role.description
      })),
      permissions: Array.from(permissions)
    };
  }

  /**
   * Updates user account status with audit logging and founder protection guardrails.
   */
  async updateUserStatus(targetUserId, newStatus, actorUserId, requestId = null) {
    const allowedStatuses = ['ACTIVE', 'PENDING', 'SUSPENDED', 'INACTIVE', 'REJECTED'];
    if (!allowedStatuses.includes(newStatus)) {
      const err = new Error(`Invalid status: ${newStatus}. Allowed: ${allowedStatuses.join(', ')}`);
      err.code = 'INVALID_STATUS';
      err.status = 400;
      throw err;
    }

    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: targetUserId },
        include: {
          userRoles: {
            include: {
              role: true
            }
          }
        }
      });

      if (!user) {
        const err = new Error('User not found.');
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }

      // Guardrail 1: Founder account status is permanently protected
      const hasFounderRole = user.userRoles.some((ur) => ur.role.code === 'FOUNDER');
      const isConfiguredFounder = env.FOUNDER_EMAIL && user.email.toLowerCase() === env.FOUNDER_EMAIL.toLowerCase();

      if ((hasFounderRole || isConfiguredFounder) && newStatus !== 'ACTIVE') {
        const err = new Error('Security policy violation: Founder account status cannot be deactivated, suspended, or demoted.');
        err.code = 'CANNOT_MODIFY_FOUNDER_STATUS';
        err.status = 403;
        throw err;
      }

      // Guardrail 2: Self-deactivation prevention
      if (actorUserId === targetUserId && ['SUSPENDED', 'INACTIVE', 'REJECTED'].includes(newStatus)) {
        const err = new Error('Self-deactivation is prohibited. Another administrator must modify your account status.');
        err.code = 'CANNOT_SELF_DEACTIVATE';
        err.status = 400;
        throw err;
      }

      const beforeState = { status: user.status };
      const afterState = { status: newStatus };

      const updatedUser = await tx.user.update({
        where: { id: targetUserId },
        data: { status: newStatus },
        include: {
          profile: true,
          userRoles: {
            include: {
              role: true
            }
          }
        }
      });

      // Record audit log
      await auditService.createAuditLog(tx, {
        actorUserId,
        action: 'USER_STATUS_UPDATED',
        resourceType: 'USER',
        resourceId: targetUserId,
        beforeState,
        afterState,
        requestId,
        result: 'SUCCESS'
      });

      logger.info(
        { actorUserId, targetUserId, oldStatus: user.status, newStatus },
        'User account status updated'
      );

      return {
        id: updatedUser.id,
        email: updatedUser.email,
        status: updatedUser.status,
        updatedAt: updatedUser.updatedAt
      };
    });
  }
}

export default new UserService();
