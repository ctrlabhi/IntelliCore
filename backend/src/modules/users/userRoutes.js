import { Router } from 'express';
import userController from './userController.js';
import roleController from '../roles/roleController.js';
import { authenticate, requireAuth, requirePermission, requirePrimaryFounder } from '../../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     summary: Directory of Registered Users
 *     description: Returns paginated directory of registered users with search and filtering.
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
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACTIVE, REJECTED, SUSPENDED, INACTIVE]
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Users list
 *       403:
 *         description: Forbidden
 */
router.get(
  '/',
  authenticate,
  requireAuth,
  requirePermission('users:read'),
  userController.getUsers
);

/**
 * @openapi
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get Single User Details
 *     description: Returns complete profile, roles, and status for a user.
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
 *         description: User profile
 *       404:
 *         description: User not found
 */
router.get(
  '/:id',
  authenticate,
  requireAuth,
  requirePermission('users:read'),
  userController.getUserById
);

/**
 * @openapi
 * /api/v1/users/{id}/status:
 *   patch:
 *     summary: Update User Account Status
 *     description: Modifies account status (ACTIVE, SUSPENDED, INACTIVE, REJECTED).
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, ACTIVE, REJECTED, SUSPENDED, INACTIVE]
 *     responses:
 *       200:
 *         description: Status updated
 *       403:
 *         description: Cannot modify founder status or forbidden
 */
router.patch(
  '/:id/status',
  authenticate,
  requireAuth,
  requirePermission('users:update_status'),
  userController.updateUserStatus
);

/**
 * @openapi
 * /api/v1/users/{id}/roles:
 *   get:
 *     summary: Get Assigned User Roles & Permissions
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
 *         description: Roles list
 */
router.get(
  '/:id/roles',
  authenticate,
  requireAuth,
  requirePermission('users:read'),
  userController.getUserRoles
);

/**
 * @openapi
 * /api/v1/users/{id}/roles:
 *   put:
 *     summary: Assign Roles to User
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
 *               - roles
 *             properties:
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Roles updated
 */
router.put(
  '/:id/roles',
  authenticate,
  requireAuth,
  requirePrimaryFounder,
  requirePermission('roles:assign'),
  roleController.assignUserRoles
);

/**
 * @openapi
 * /api/v1/users/{id}/deletion-preview:
 *   post:
 *     summary: Generate Permanent Deletion Impact Preview
 *     description: Restricted exclusively to primary Founder. Requires recent authentication.
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
 *         description: Deletion impact preview
 *       403:
 *         description: Forbidden
 */
router.post(
  '/:id/deletion-preview',
  authenticate,
  requireAuth,
  requirePrimaryFounder,
  userController.getDeletionPreview
);

router.get(
  '/:id/deletion-preview',
  authenticate,
  requireAuth,
  requirePrimaryFounder,
  userController.getDeletionPreview
);

/**
 * @openapi
 * /api/v1/users/{id}/permanent-deletion:
 *   post:
 *     summary: Execute Permanent User Account Deletion
 *     description: Irreversible permanent deletion across MySQL, private files, and Firebase. Restricted exclusively to primary Founder.
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
 *               - reason
 *               - confirmationText
 *             properties:
 *               reason:
 *                 type: string
 *               confirmationText:
 *                 type: string
 *               previewHash:
 *                 type: string
 *               previewTimestamp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Deletion job started/completed
 *       403:
 *         description: Forbidden
 */
router.post(
  '/:id/permanent-deletion',
  authenticate,
  requireAuth,
  requirePrimaryFounder,
  userController.executePermanentDeletion
);

export default router;
