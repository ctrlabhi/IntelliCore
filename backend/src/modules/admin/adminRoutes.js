import { Router } from 'express';
import adminController from './adminController.js';
import { authenticate, requireAuth, requirePermission, requirePrimaryFounder, requireStatus } from '../../middleware/auth.js';

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

/**
 * @openapi
 * /api/v1/admin/deletion-jobs:
 *   get:
 *     summary: List Account Permanent Deletion Jobs
 *     description: Restricted exclusively to primary Founder.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Deletion jobs list
 *       403:
 *         description: Forbidden
 */
router.get(
  '/deletion-jobs',
  authenticate,
  requireAuth,
  requireStatus(['ACTIVE']),
  requirePrimaryFounder,
  adminController.getDeletionJobs
);

/**
 * @openapi
 * /api/v1/admin/deletion-jobs/{id}:
 *   get:
 *     summary: Get Deletion Job Details
 *     description: Restricted exclusively to primary Founder.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Deletion job details
 *       404:
 *         description: Not found
 */
router.get(
  '/deletion-jobs/:id',
  authenticate,
  requireAuth,
  requireStatus(['ACTIVE']),
  requirePrimaryFounder,
  adminController.getDeletionJobById
);

/**
 * @openapi
 * /api/v1/admin/deletion-jobs/{id}/retry:
 *   post:
 *     summary: Retry Failed Deletion Step
 *     description: Restricted exclusively to primary Founder. Requires recent authentication.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Retried job details
 *       403:
 *         description: Forbidden
 */
router.post(
  '/deletion-jobs/:id/retry',
  authenticate,
  requireAuth,
  requireStatus(['ACTIVE']),
  requirePrimaryFounder,
  adminController.retryDeletionJob
);

export default router;
