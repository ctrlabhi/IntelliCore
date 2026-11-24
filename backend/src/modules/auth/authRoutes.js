import { Router } from 'express';
import { z } from 'zod';
import authController from './authController.js';
import { authenticate, requireAuth } from '../../middleware/auth.js';
import { sendError } from '../../utils/response.js';

const router = Router();

// Zod Schema for updating profile
const updateProfileSchema = z.object({
  fullName: z.string().min(1, 'Full name cannot be empty').max(150, 'Full name too long').optional(),
  displayName: z.string().max(100, 'Display name too long').nullable().optional(),
  profilePhotoUrl: z.string().url('Invalid URL format').max(500, 'Photo URL too long').nullable().optional()
}).strict(); // Disallow any unexpected or privileged fields

function validateUpdateProfile(req, res, next) {
  const result = updateProfileSchema.safeParse(req.body);
  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message
    }));
    return sendError(res, 'Validation failed for profile update.', 400, 'VALIDATION_ERROR', errorDetails);
  }
  req.body = result.data;
  return next();
}

/**
 * @openapi
 * /api/v1/auth/bootstrap:
 *   post:
 *     summary: Bootstrap and Synchronize Authenticated Identity
 *     description: Resolves the authenticated Firebase identity and synchronizes it with MySQL.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Identity synchronized
 *       401:
 *         description: Unauthorized token
 *       409:
 *         description: Email collision
 */
router.post('/auth/bootstrap', authenticate, (req, res) => authController.bootstrap(req, res));

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     summary: Current User Identity Context
 *     description: Returns the synchronized user profile, status, roles, and authorized workspaces.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Identity and RBAC details
 *       401:
 *         description: Unauthenticated
 */
router.get('/auth/me', authenticate, requireAuth, (req, res) => authController.getMe(req, res));

/**
 * @openapi
 * /api/v1/auth/status:
 *   get:
 *     summary: Current Account Access Status
 *     description: Returns access authorization status and workspace eligibility.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Access status
 */
router.get('/auth/status', authenticate, requireAuth, (req, res) => authController.getStatus(req, res));

/**
 * @openapi
 * /api/v1/users/me/profile:
 *   patch:
 *     summary: Update Own Profile
 *     description: Updates non-privileged own profile fields (full name, display name, photo URL).
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profile updated
 *       400:
 *         description: Validation failed
 */
router.patch('/users/me/profile', authenticate, requireAuth, validateUpdateProfile, (req, res) => authController.updateMyProfile(req, res));

export default router;

