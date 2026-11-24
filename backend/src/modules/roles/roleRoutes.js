import { Router } from 'express';
import roleController from './roleController.js';
import { authenticate, requireAuth, requirePermission } from '../../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * /api/v1/roles:
 *   get:
 *     summary: List Roles
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Roles list
 */
router.get(
  '/',
  authenticate,
  requireAuth,
  requirePermission('roles:read'),
  roleController.getRoles
);

/**
 * @openapi
 * /api/v1/roles/{id}:
 *   get:
 *     summary: Get Single Role Details
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role details
 */
router.get(
  '/:id',
  authenticate,
  requireAuth,
  requirePermission('roles:read'),
  roleController.getRoleById
);

/**
 * @openapi
 * /api/v1/roles/{id}/permissions:
 *   put:
 *     summary: Configure Role Permissions
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permissions
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Permissions updated
 */
router.put(
  '/:id/permissions',
  authenticate,
  requireAuth,
  requirePermission('roles:manage_permissions'),
  roleController.updateRolePermissions
);

export default router;
