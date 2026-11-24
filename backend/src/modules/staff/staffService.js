import { getPrismaClient } from '../../config/database.js';
import auditService from '../audit/auditService.js';
import logger from '../../config/logger.js';
import { AppError } from '../../utils/errors.js';
import { isProtectedFounder } from '../../utils/founder.js';
import { lockUser, transaction } from '../../utils/phase04.js';
import { activeEnrollments, openApplications } from '../internships/internshipPolicy.js';

const prisma = getPrismaClient();

const ALLOWED_STAFF_ROLES = [
  'HR_MANAGER',
  'HR_EXECUTIVE',
  'OPERATIONS_EXECUTIVE',
  'TEAM_LEADER'
];

const ALLOWED_EMPLOYMENT_STATUSES = ['ACTIVE', 'SUSPENDED', 'INACTIVE'];

export class StaffService {
  /**
   * Generates next sequential staff code (e.g. STF-0001)
   */
  async generateStaffCode(tx) {
    const [row] = await tx.$queryRaw`
      SELECT MAX(CAST(SUBSTRING(staff_code, 5) AS UNSIGNED)) AS lastNumber
      FROM staff_profiles WHERE staff_code REGEXP '^STF-[0-9]+$'
    `;
    return `STF-${String(BigInt(row.lastNumber ?? 0) + 1n).padStart(4, '0')}`;
  }

  /**
   * Provisions an existing registered user as an active staff member.
   */
  async provisionStaff({
    userId,
    designation,
    joiningDate,
    roleCode,
    createdBy = null,
    requestId = null
  }) {
    if (!userId) {
      const err = new Error('Target User ID is required.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }
    if (!designation || typeof designation !== 'string' || designation.trim().length < 2) {
      const err = new Error('A valid designation (minimum 2 characters) is required.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }
    if (!joiningDate) {
      const err = new Error('A valid joining date is required.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }
    if (!roleCode || !ALLOWED_STAFF_ROLES.includes(roleCode)) {
      const err = new Error(`Invalid staff role code: ${roleCode}. Allowed: ${ALLOWED_STAFF_ROLES.join(', ')}`);
      err.code = 'INVALID_STAFF_ROLE';
      err.status = 400;
      throw err;
    }

    const parsedJoiningDate = new Date(joiningDate);
    if (isNaN(parsedJoiningDate.getTime())) {
      const err = new Error('Joining date must be a valid ISO date.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }

    return await transaction(async (tx) => {
      await lockUser(tx, userId);
      // 1. Check user exists
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          staffProfile: true,
          userRoles: {
            include: { role: true }
          }
        }
      });

      if (!user) {
        const err = new Error('User not found.');
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }

      if (user.staffProfile) {
        const err = new Error(`User is already provisioned as staff with code: ${user.staffProfile.staffCode}.`);
        err.code = 'STAFF_ALREADY_EXISTS';
        err.status = 409;
        throw err;
      }
      if (isProtectedFounder(user) || !['ACTIVE', 'PENDING'].includes(user.status) || !user.emailVerified) {
        throw new AppError('Choose an eligible verified account for staff provisioning.', 409, 'STAFF_NOT_ELIGIBLE');
      }
      const application = await tx.internshipApplication.findFirst({
        where: { applicantUserId: userId, applicationStatus: { in: openApplications } }, select: { id: true }
      });
      const enrollment = await tx.internship.findFirst({
        where: { userId, internshipStatus: { in: activeEnrollments } }, select: { id: true }
      });
      if (application || enrollment) {
        throw new AppError('Resolve the active internship or application before provisioning staff.', 409, 'INTERNSHIP_ACCOUNT_CONFLICT');
      }

      // 2. Fetch role to assign
      const targetRole = await tx.role.findUnique({
        where: { code: roleCode }
      });

      if (!targetRole) {
        const err = new Error(`Role ${roleCode} is not registered in the system.`);
        err.code = 'ROLE_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      // 3. Generate sequential staff code
      const staffCode = await this.generateStaffCode(tx);

      // 4. Create StaffProfile
      const staffProfile = await tx.staffProfile.create({
        data: {
          userId,
          staffCode,
          designation: designation.trim(),
          joiningDate: parsedJoiningDate,
          employmentStatus: 'ACTIVE',
          createdBy
        }
      });

      // 5. Ensure user account is ACTIVE
      if (user.status !== 'ACTIVE') {
        await tx.user.update({
          where: { id: userId },
          data: { status: 'ACTIVE' }
        });
      }

      // 6. Assign staff role and remove default INTERN role if present
      const internRole = await tx.role.findUnique({ where: { code: 'INTERN' } });
      if (internRole) {
        await tx.userRole.deleteMany({
          where: {
            userId,
            roleId: internRole.id
          }
        });
      }

      await tx.userRole.upsert({
        where: {
          userId_roleId: {
            userId,
            roleId: targetRole.id
          }
        },
        update: {
          assignedBy: createdBy,
          assignedAt: new Date()
        },
        create: {
          userId,
          roleId: targetRole.id,
          assignedBy: createdBy
        }
      });

      // 7. Record Audit Log
      await auditService.createAuditLog(tx, {
        actorUserId: createdBy,
        action: 'STAFF_PROVISIONED',
        resourceType: 'STAFF_PROFILE',
        resourceId: staffProfile.id,
        beforeState: null,
        afterState: {
          staffCode: staffProfile.staffCode,
          userId,
          designation: staffProfile.designation,
          roleCode,
          employmentStatus: staffProfile.employmentStatus
        },
        requestId,
        result: 'SUCCESS'
      });

      logger.info({ staffCode, userId, designation: staffProfile.designation, roleCode }, 'Staff member provisioned successfully');

      return {
        id: staffProfile.id,
        staffCode: staffProfile.staffCode,
        userId: staffProfile.userId,
        designation: staffProfile.designation,
        joiningDate: staffProfile.joiningDate,
        employmentStatus: staffProfile.employmentStatus,
        role: {
          code: targetRole.code,
          name: targetRole.name
        }
      };
    }, { retryUnique: true });
  }

  /**
   * Retrieves paginated staff directory.
   */
  async listStaff({ page = 1, limit = 20, search = '', status = '' } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (status) {
      where.employmentStatus = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { staffCode: { contains: q } },
        { designation: { contains: q } },
        { user: { email: { contains: q } } },
        { user: { profile: { fullName: { contains: q } } } }
      ];
    }

    const [total, staffList] = await Promise.all([
      prisma.staffProfile.count({ where }),
      prisma.staffProfile.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { staffCode: 'asc' },
        include: {
          user: {
            include: {
              profile: true,
              userRoles: {
                include: { role: true }
              }
            }
          }
        }
      })
    ]);

    const formatted = staffList.map((stf) => ({
      id: stf.id,
      staffCode: stf.staffCode,
      designation: stf.designation,
      joiningDate: stf.joiningDate,
      employmentStatus: stf.employmentStatus,
      createdAt: stf.createdAt,
      user: {
        id: stf.user.id,
        email: stf.user.email,
        status: stf.user.status,
        fullName: stf.user.profile?.fullName || 'N/A',
        profilePhotoUrl: stf.user.profile?.profilePhotoUrl || null,
        roles: stf.user.userRoles.map((ur) => ({
          code: ur.role.code,
          name: ur.role.name
        }))
      }
    }));

    return {
      staff: formatted,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * Retrieves single staff member details.
   */
  async getStaffById(id) {
    const staff = await prisma.staffProfile.findFirst({
      where: {
        OR: [{ id }, { userId: id }, { staffCode: id }]
      },
      include: {
        user: {
          include: {
            profile: true,
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: { permission: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!staff) {
      const err = new Error('Staff record not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const permissions = new Set();
    staff.user.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        if (rp.permission?.code) permissions.add(rp.permission.code);
      });
    });

    return {
      id: staff.id,
      staffCode: staff.staffCode,
      designation: staff.designation,
      joiningDate: staff.joiningDate,
      employmentStatus: staff.employmentStatus,
      createdAt: staff.createdAt,
      user: {
        id: staff.user.id,
        email: staff.user.email,
        status: staff.user.status,
        fullName: staff.user.profile?.fullName || 'N/A',
        displayName: staff.user.profile?.displayName || null,
        profilePhotoUrl: staff.user.profile?.profilePhotoUrl || null,
        roles: staff.user.userRoles.map((ur) => ({
          code: ur.role.code,
          name: ur.role.name
        })),
        permissions: Array.from(permissions)
      }
    };
  }

  /**
   * Updates staff designation or joining date.
   */
  async updateStaff(id, { designation, joiningDate }, actorUserId, requestId = null) {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.staffProfile.findUnique({
        where: { id }
      });

      if (!existing) {
        const err = new Error('Staff record not found.');
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }

      const updateData = {};
      if (designation && designation.trim()) {
        updateData.designation = designation.trim();
      }
      if (joiningDate) {
        const d = new Date(joiningDate);
        if (!isNaN(d.getTime())) {
          updateData.joiningDate = d;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return existing;
      }

      const beforeState = {
        designation: existing.designation,
        joiningDate: existing.joiningDate
      };

      const updated = await tx.staffProfile.update({
        where: { id },
        data: updateData
      });

      await auditService.createAuditLog(tx, {
        actorUserId,
        action: 'STAFF_UPDATED',
        resourceType: 'STAFF_PROFILE',
        resourceId: id,
        beforeState,
        afterState: updateData,
        requestId,
        result: 'SUCCESS'
      });

      return updated;
    });
  }

  /**
   * Updates staff employment status (ACTIVE, SUSPENDED, INACTIVE).
   */
  async updateStaffStatus(id, newStatus, actorUserId, requestId = null) {
    if (!ALLOWED_EMPLOYMENT_STATUSES.includes(newStatus)) {
      const err = new Error(`Invalid employment status: ${newStatus}. Allowed: ${ALLOWED_EMPLOYMENT_STATUSES.join(', ')}`);
      err.code = 'INVALID_STATUS';
      err.status = 400;
      throw err;
    }

    return await transaction(async (tx) => {
      const target = await tx.staffProfile.findUnique({ where: { id }, select: { userId: true } });
      if (target) await lockUser(tx, target.userId);
      const staff = await tx.staffProfile.findUnique({
        where: { id },
        include: { user: { include: { userRoles: { include: { role: true } } } } }
      });

      if (!staff) {
        const err = new Error('Staff record not found.');
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }
      if (isProtectedFounder(staff.user) && newStatus !== 'ACTIVE') {
        throw new AppError('The primary Founder account status is protected.', 403, 'CANNOT_MODIFY_FOUNDER_STATUS');
      }

      // Self-suspension guardrail
      if (staff.userId === actorUserId && newStatus !== 'ACTIVE') {
        const err = new Error('Staff members cannot suspend or deactivate their own employment status.');
        err.code = 'CANNOT_SELF_DEACTIVATE';
        err.status = 400;
        throw err;
      }

      const beforeState = { employmentStatus: staff.employmentStatus };
      const afterState = { employmentStatus: newStatus };

      const updated = await tx.staffProfile.update({
        where: { id },
        data: { employmentStatus: newStatus }
      });

      if (newStatus !== 'ACTIVE' && (staff.user.status === 'ACTIVE' || staff.user.status === staff.employmentStatus)) {
        await tx.user.update({
          where: { id: staff.userId },
          data: { status: newStatus }
        });
      } else if (newStatus === 'ACTIVE' && staff.employmentStatus !== 'ACTIVE' && staff.user.status === staff.employmentStatus) {
        await tx.user.update({
          where: { id: staff.userId },
          data: { status: 'ACTIVE' }
        });
      }

      await auditService.createAuditLog(tx, {
        actorUserId,
        action: 'STAFF_STATUS_UPDATED',
        resourceType: 'STAFF_PROFILE',
        resourceId: id,
        beforeState,
        afterState,
        requestId,
        result: 'SUCCESS'
      });

      logger.info({ staffId: id, staffCode: staff.staffCode, oldStatus: staff.employmentStatus, newStatus }, 'Staff employment status updated');

      return updated;
    });
  }
}

export default new StaffService();
