import adminService from './adminService.js';
import accountDeletionService from '../users/accountDeletionService.js';
import { assertRecentAuthentication } from '../../utils/recentAuth.js';
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

  async getDeletionJobs(req, res) {
    try {
      const { page, limit, status } = req.query;
      const data = await accountDeletionService.getDeletionJobs({ page, limit, status });
      return sendSuccess(res, data, 'Deletion jobs retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve deletion jobs', err.status || 500, err.code || 'DELETION_JOBS_ERROR');
    }
  }

  async getDeletionJobById(req, res) {
    try {
      const { id } = req.params;
      const job = await accountDeletionService.getDeletionJobById(id);
      return sendSuccess(res, job, 'Deletion job details retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve deletion job', err.status || 500, err.code || 'DELETION_JOB_FETCH_ERROR');
    }
  }

  async retryDeletionJob(req, res) {
    try {
      assertRecentAuthentication(req);
      const { id } = req.params;
      const result = await accountDeletionService.retryDeletionJob(id, req.user);
      return sendSuccess(res, result.job, result.message, 200);
    } catch (err) {
      return sendError(res, err.message || 'Failed to retry deletion job', err.status || 500, err.code || 'RETRY_DELETION_ERROR');
    }
  }
}

export default new AdminController();
