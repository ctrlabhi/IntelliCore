import { Router } from 'express';
import adminController from './adminController.js';
import { authenticate, requireAuth, requirePermission } from '../../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * /api/v1/admin/stats:
 *   get:
 *     summary: Real-time System Statistics
 *     description: Aggregated counts for users, staff, audit records, and system health.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System metrics
 *       403:
 *         description: Forbidden
 */
router.get(
  '/stats',
  authenticate,
  requireAuth,
  requirePermission('analytics:read'),
  adminController.getStats
);

export default router;
