import authService from './authService.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class AuthController {
  /**
   * Synchronize authenticated Firebase account with MySQL
   * POST /api/v1/auth/bootstrap
   */
  async bootstrap(req, res) {
    try {
      const { uid, email, email_verified } = req.firebaseUser;
      const { fullName, photoUrl } = req.body || {};

      if (!email) {
        return sendError(res, 'Authenticated identity does not have an associated email address.', 400, 'MISSING_EMAIL');
      }

      const result = await authService.bootstrapAccount({
        firebaseUid: uid,
        email,
        emailVerified: Boolean(email_verified),
        fullName: fullName || req.firebaseUser.name,
        photoUrl: photoUrl || req.firebaseUser.picture
      });

      return sendSuccess(res, result, 'Identity synchronized successfully.');
    } catch (err) {
      if (err.status) {
        return sendError(res, err.message, err.status, err.code);
      }
      return sendError(res, err.message || 'Failed to synchronize account identity.', 500, 'BOOTSTRAP_FAILED');
    }
  }

  /**
   * Get current authenticated user details and workspace context
   * GET /api/v1/auth/me
   */
  async getMe(req, res) {
    try {
      const context = await authService.getUserContext(req.user.id);
      return sendSuccess(res, context, 'Authenticated user details retrieved.');
    } catch (err) {
      if (err.status) {
        return sendError(res, err.message, err.status, err.code);
      }
      return sendError(res, 'Failed to retrieve user context.', 500, 'USER_CONTEXT_FAILED');
    }
  }

  /**
   * Get current account status and workspace access authorization
   * GET /api/v1/auth/status
   */
  async getStatus(req, res) {
    try {
      const context = await authService.getUserContext(req.user.id);
      const statusData = {
        id: context.id,
        status: context.status,
        emailVerified: context.emailVerified,
        roles: context.roles,
        workspaces: context.workspaces,
        isAccessGranted: context.status === 'ACTIVE' && context.emailVerified
      };
      return sendSuccess(res, statusData, 'Account status retrieved.');
    } catch (err) {
      return sendError(res, 'Failed to retrieve account status.', 500, 'STATUS_CHECK_FAILED');
    }
  }

  /**
   * Update own profile
   * PATCH /api/v1/users/me/profile
   */
  async updateMyProfile(req, res) {
    try {
      const { fullName, displayName, profilePhotoUrl } = req.body;
      const updatedProfile = await authService.updateProfile(req.user.id, {
        fullName,
        displayName,
        profilePhotoUrl
      });
      return sendSuccess(res, updatedProfile, 'Profile updated successfully.');
    } catch (err) {
      return sendError(res, err.message || 'Failed to update profile.', 400, 'PROFILE_UPDATE_FAILED');
    }
  }
}

export const authController = new AuthController();
export default authController;

