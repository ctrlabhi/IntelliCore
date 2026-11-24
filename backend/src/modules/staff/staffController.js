import staffService from './staffService.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class StaffController {
  async getStaff(req, res) {
    try {
      const { page, limit, search, status } = req.query;
      const data = await staffService.listStaff({ page, limit, search, status });
      return sendSuccess(res, data, 'Staff directory retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve staff directory', err.status || 500, err.code || 'STAFF_FETCH_ERROR');
    }
  }

  async getStaffById(req, res) {
    try {
      const { id } = req.params;
      const staff = await staffService.getStaffById(id);
      return sendSuccess(res, staff, 'Staff details retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve staff record', err.status || 500, err.code || 'STAFF_FETCH_ERROR');
    }
  }

  async provisionStaff(req, res) {
    try {
      const { userId, designation, joiningDate, roleCode } = req.body;
      const createdBy = req.user?.id;
      const requestId = res.locals?.requestId || null;

      const result = await staffService.provisionStaff({
        userId,
        designation,
        joiningDate,
        roleCode,
        createdBy,
        requestId
      });

      return sendSuccess(res, result, 'Staff member provisioned successfully', 201);
    } catch (err) {
      return sendError(res, err.message || 'Failed to provision staff member', err.status || 500, err.code || 'STAFF_PROVISION_ERROR');
    }
  }

  async updateStaff(req, res) {
    try {
      const { id } = req.params;
      const { designation, joiningDate } = req.body;
      const actorUserId = req.user?.id;
      const requestId = res.locals?.requestId || null;

      const result = await staffService.updateStaff(id, { designation, joiningDate }, actorUserId, requestId);
      return sendSuccess(res, result, 'Staff details updated successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to update staff member', err.status || 500, err.code || 'STAFF_UPDATE_ERROR');
    }
  }

  async updateStaffStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const actorUserId = req.user?.id;
      const requestId = res.locals?.requestId || null;

      if (!status) {
        return sendError(res, 'New employment status is required.', 400, 'MISSING_STATUS');
      }

      const result = await staffService.updateStaffStatus(id, status, actorUserId, requestId);
      return sendSuccess(res, result, 'Staff employment status updated successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to update staff status', err.status || 500, err.code || 'STAFF_STATUS_UPDATE_ERROR');
    }
  }
}

export default new StaffController();
