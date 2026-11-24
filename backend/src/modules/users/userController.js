import userService from './userService.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class UserController {
  async getUsers(req, res) {
    try {
      const { page, limit, search, status, role } = req.query;
      const data = await userService.listUsers({ page, limit, search, status, role });
      return sendSuccess(res, data, 'Users retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve users', err.status || 500, err.code || 'USERS_FETCH_ERROR');
    }
  }

  async getUserById(req, res) {
    try {
      const { id } = req.params;
      const user = await userService.getUserById(id);
      return sendSuccess(res, user, 'User details retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve user', err.status || 500, err.code || 'USER_FETCH_ERROR');
    }
  }

  async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const actorUserId = req.user?.id;
      const requestId = res.locals?.requestId || null;

      if (!status) {
        return sendError(res, 'New status is required.', 400, 'MISSING_STATUS');
      }

      const result = await userService.updateUserStatus(id, status, actorUserId, requestId);
      return sendSuccess(res, result, 'User status updated successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to update user status', err.status || 500, err.code || 'STATUS_UPDATE_ERROR');
    }
  }

  async getUserRoles(req, res) {
    try {
      const { id } = req.params;
      const user = await userService.getUserById(id);
      return sendSuccess(res, { roles: user.roles, permissions: user.permissions }, 'User roles retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve user roles', err.status || 500, err.code || 'ROLES_FETCH_ERROR');
    }
  }
}

export default new UserController();
