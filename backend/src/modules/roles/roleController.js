import roleService from './roleService.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class RoleController {
  async getRoles(req, res) {
    try {
      const roles = await roleService.listRoles();
      return sendSuccess(res, roles, 'Roles retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve roles', 500, 'ROLES_FETCH_ERROR');
    }
  }

  async getRoleById(req, res) {
    try {
      const { id } = req.params;
      const role = await roleService.getRoleById(id);
      return sendSuccess(res, role, 'Role details retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve role', err.status || 500, err.code || 'ROLE_FETCH_ERROR');
    }
  }

  async getPermissions(req, res) {
    try {
      const permissions = await roleService.listPermissions();
      return sendSuccess(res, permissions, 'Permissions catalog retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve permissions', 500, 'PERMISSIONS_FETCH_ERROR');
    }
  }

  async assignUserRoles(req, res) {
    try {
      const { id } = req.params;
      const { roles } = req.body;
      const actor = {
        user: req.user,
        roles: req.roles || []
      };
      const requestId = res.locals?.requestId || null;

      const updatedRoles = await roleService.assignUserRoles(id, roles, actor, requestId);
      return sendSuccess(res, { userId: id, roles: updatedRoles }, 'User roles updated successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to assign user roles', err.status || 500, err.code || 'ROLES_ASSIGN_ERROR');
    }
  }

  async updateRolePermissions(req, res) {
    try {
      const { id } = req.params;
      const { permissions } = req.body;
      const actorUserId = req.user?.id;
      const requestId = res.locals?.requestId || null;

      const result = await roleService.updateRolePermissions(id, permissions, actorUserId, requestId);
      return sendSuccess(res, result, 'Role permissions updated successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to update role permissions', err.status || 500, err.code || 'PERMISSIONS_UPDATE_ERROR');
    }
  }
}

export default new RoleController();
