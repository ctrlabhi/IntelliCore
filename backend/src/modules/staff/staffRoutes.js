import { Router } from 'express';
import staffController from './staffController.js';
import { authenticate, requireAuth, requirePermission, requirePrimaryFounder } from '../../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * /api/v1/staff:
 *   get:
 *     summary: Directory of Staff Members
 *     description: Paginated directory of staff members with user profiles and assigned roles.
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
 *           enum: [ACTIVE, SUSPENDED, INACTIVE]
 *     responses:
 *       200:
 *         description: Staff list
 *       403:
 *         description: Forbidden
 */
router.get(
  '/',
  authenticate,
  requireAuth,
  requirePermission('staff:read'),
  staffController.getStaff
);

/**
 * @openapi
 * /api/v1/staff/{id}:
 *   get:
 *     summary: Get Single Staff Member
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
 *         description: Staff member profile
 *       404:
 *         description: Staff not found
 */
router.get(
  '/:id',
  authenticate,
  requireAuth,
  requirePermission('staff:read'),
  staffController.getStaffById
);

/**
 * @openapi
 * /api/v1/staff:
 *   post:
 *     summary: Provision Registered User as Staff Member
 *     description: Assigns staff code, designation, joining date, and privileged staff role.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - designation
 *               - joiningDate
 *               - roleCode
 *             properties:
 *               userId:
 *                 type: string
 *               designation:
 *                 type: string
 *               joiningDate:
 *                 type: string
 *                 format: date
 *               roleCode:
 *                 type: string
 *                 enum: [HR_MANAGER, HR_EXECUTIVE, OPERATIONS_EXECUTIVE, TEAM_LEADER]
 *     responses:
 *       201:
 *         description: Staff provisioned
 *       400:
 *         description: Validation error
 *       409:
 *         description: Already staff
 */
router.post(
  '/',
  authenticate,
  requireAuth,
  requirePrimaryFounder,
  requirePermission('staff:create'),
  staffController.provisionStaff
);

/**
 * @openapi
 * /api/v1/staff/{id}:
 *   patch:
 *     summary: Update Staff Designation or Joining Date
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               designation:
 *                 type: string
 *               joiningDate:
 *                 type: string
 *     responses:
 *       200:
 *         description: Staff updated
 */
router.patch(
  '/:id',
  authenticate,
  requireAuth,
  requirePermission('staff:update'),
  staffController.updateStaff
);

/**
 * @openapi
 * /api/v1/staff/{id}/status:
 *   patch:
 *     summary: Update Staff Employment Status
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
 *                 enum: [ACTIVE, SUSPENDED, INACTIVE]
 *     responses:
 *       200:
 *         description: Employment status updated
 */
router.patch(
  '/:id/status',
  authenticate,
  requireAuth,
  requirePermission('staff:update_status'),
  staffController.updateStaffStatus
);

export default router;
