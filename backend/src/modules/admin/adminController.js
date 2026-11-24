import adminService from './adminService.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class AdminController {
  async getStats(req, res) {
    try {
      const stats = await adminService.getSystemStats();
      return sendSuccess(res, stats, 'System statistics retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve administrative statistics', 500, 'STATS_FETCH_ERROR');
    }
  }
}

export default new AdminController();
