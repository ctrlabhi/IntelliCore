import { Router } from 'express';
import auditController from './auditController.js';
import { authenticate, requireAuth, requirePermission } from '../../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * /api/v1/audit-logs:
 *   get:
 *     summary: Retrieve System Audit Logs
 *     description: Returns paginated security and administrative audit event logs.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated audit logs
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden (insufficient permissions)
 */
router.get(
  '/',
  authenticate,
  requireAuth,
  requirePermission('audit_logs:read'),
  auditController.getAuditLogs
);

export default router;
