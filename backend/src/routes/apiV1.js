import { Router } from 'express';
import { sendSuccess } from '../utils/response.js';
import { checkDatabaseConnection } from '../config/database.js';
import env from '../config/env.js';
import authRoutes from '../modules/auth/authRoutes.js';
import departmentRoutes from '../modules/departments/departmentRoutes.js';
import applicationRoutes from '../modules/internships/applicationRoutes.js';
import internshipRoutes from '../modules/internships/internshipRoutes.js';
import { promotionRoutes } from '../modules/internships/followupRoutes.js';
import { attendanceRoutes, correctionRoutes, dailyWorkReportRoutes, leaveRoutes } from '../modules/attendance/phase05Routes.js';
import { workRoutes } from '../modules/work/workRoutes.js';
import { notificationRoutes } from '../modules/notifications/notificationRoutes.js';
import { meetingRoutes } from '../modules/meetings/meetingRoutes.js';
import { calendarRoutes } from '../modules/meetings/calendarRoutes.js';

const router = Router();

/**
 * @openapi
 * /api/v1:
 *   get:
 *     summary: API Version 1 Root Metadata
 *     description: Returns metadata about the IntelliCore REST API v1.
 *     responses:
 *       200:
 *         description: API details
 */
router.get('/', (req, res) => {
  return sendSuccess(res, {
    api: 'IntelliCore REST API',
    version: 'v1',
    environment: env.NODE_ENV,
    timezone: env.APP_TIMEZONE,
    docs: '/api-docs',
    endpoints: {
      health: '/api/v1/health',
      swagger: '/api-docs'
    }
  }, 'IntelliCore API v1 operational');
});

/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     summary: Versioned API Health Diagnostic
 *     description: Detailed diagnostics including process uptime and database state.
 *     responses:
 *       200:
 *         description: Diagnostic status
 */
router.get('/health', async (req, res) => {
  const isDbConnected = await checkDatabaseConnection();

  const diagnostic = {
    service: 'intellicore-api',
    version: '2.0.0',
    apiVersion: 'v1',
    uptimeSeconds: Math.floor(process.uptime()),
    database: isDbConnected ? 'CONNECTED' : 'DISCONNECTED',
    memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  };

  if (!isDbConnected) {
    return res.status(503).json({
      success: false,
      data: diagnostic,
      error: {
        code: 'DATABASE_DISCONNECTED',
        message: 'The database is currently unreachable.'
      },
      requestId: res.locals.requestId || null,
      timestamp: new Date().toISOString()
    });
  }

  return sendSuccess(res, diagnostic, 'System operational');
});

// Authentication and Identity Management Routes
router.use('/', authRoutes);

// User Directory & Profile Administration
import userRoutes from '../modules/users/userRoutes.js';
router.use('/users', userRoutes);

// Staff Directory & Employment Provisioning
import staffRoutes from '../modules/staff/staffRoutes.js';
router.use('/staff', staffRoutes);

// Role & Permission Management
import roleRoutes from '../modules/roles/roleRoutes.js';
router.use('/roles', roleRoutes);

import permissionRoutes from '../modules/roles/permissionRoutes.js';
router.use('/permissions', permissionRoutes);

// Security & Audit Event Logs
import auditRoutes from '../modules/audit/auditRoutes.js';
router.use('/audit-logs', auditRoutes);

// Operational Analytics & Metrics
import adminRoutes from '../modules/admin/adminRoutes.js';
router.use('/admin', adminRoutes);
router.use('/departments', departmentRoutes);
router.use('/internship-applications', applicationRoutes);
router.use('/internships', internshipRoutes);
router.use('/promotions', promotionRoutes);
router.use('/meetings', meetingRoutes);
router.use('/calendar', calendarRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/daily-work-reports', dailyWorkReportRoutes);
router.use('/leave-requests', leaveRoutes);
router.use('/attendance-corrections', correctionRoutes);
router.use(workRoutes);
router.use(notificationRoutes);

import certificateRoutes from '../modules/certificates/certificateRoutes.js';
router.use(certificateRoutes);

export default router;

