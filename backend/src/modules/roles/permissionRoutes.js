import { Router } from 'express';
import roleController from './roleController.js';
import { authenticate, requireAuth, requirePermission } from '../../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * /api/v1/permissions:
 *   get:
 *     summary: List All System Permissions
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Permissions catalog
 */
router.get(
  '/',
  authenticate,
  requireAuth,
  requirePermission('permissions:read'),
  roleController.getPermissions
);

export default router;
