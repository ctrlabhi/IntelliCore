import { getPrismaClient } from '../../config/database.js';
import env from '../../config/env.js';
import { businessToday } from '../../utils/phase04.js';
import { internshipStatuses, statusFilter } from '../internships/internshipPolicy.js';

const prisma = getPrismaClient();

export class AdminService {
  /**
   * Aggregates real-time operational and user metrics from MySQL.
   */
  async getSystemStats() {
    const today = businessToday();
    const [
      totalUsers,
      activeUsers,
      pendingUsers,
      suspendedUsers,
      totalStaff,
      activeStaff,
      suspendedStaff,
      totalAuditLogs,
      totalRoles,
      totalPermissions,
      totalDepartments,
      activeDepartments,
      byDepartment,
      applicationCounts,
      enrollmentCounts
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.staffProfile.count(),
      prisma.staffProfile.count({ where: { employmentStatus: 'ACTIVE' } }),
      prisma.staffProfile.count({ where: { employmentStatus: 'SUSPENDED' } }),
      prisma.auditLog.count(),
      prisma.role.count(),
      prisma.permission.count(),
      prisma.department.count(),
      prisma.department.count({ where: { isActive: true } }),
      prisma.department.findMany({ select: { name: true, code: true, _count: { select: { internships: true } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      prisma.internshipApplication.groupBy({ by: ['applicationStatus'], _count: { _all: true } }),
      Promise.all(internshipStatuses.map(async (status) =>
        [status, await prisma.internship.count({ where: statusFilter(status, today) })]))
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        pending: pendingUsers,
        suspended: suspendedUsers
      },
      staff: {
        total: totalStaff,
        active: activeStaff,
        suspended: suspendedStaff
      },
      departments: { total: totalDepartments, active: activeDepartments,
        counts: byDepartment.map(({ name, code, _count }) => ({ name, code, internships: _count.internships })) },
      applications: Object.fromEntries(applicationCounts.map(({ applicationStatus, _count }) => [applicationStatus, _count._all])),
      internships: Object.fromEntries(enrollmentCounts),
      system: {
        totalAuditLogs,
        totalRoles,
        totalPermissions,
        environment: env.NODE_ENV,
        timezone: env.APP_TIMEZONE,
        uptimeSeconds: Math.floor(process.uptime())
      }
    };
  }
}

export default new AdminService();
