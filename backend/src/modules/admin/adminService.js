import { getPrismaClient } from '../../config/database.js';
import env from '../../config/env.js';

const prisma = getPrismaClient();

export class AdminService {
  /**
   * Aggregates real-time operational and user metrics from MySQL.
   */
  async getSystemStats() {
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
      totalPermissions
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
      prisma.permission.count()
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
