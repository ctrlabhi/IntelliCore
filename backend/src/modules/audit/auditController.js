import auditService from './auditService.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class AuditController {
  async getAuditLogs(req, res) {
    try {
      const { page, limit, actorUserId, action, resourceType, result, startDate, endDate } = req.query;

      const resultData = await auditService.listAuditLogs({
        page,
        limit,
        actorUserId,
        action,
        resourceType,
        result,
        startDate,
        endDate
      });

      return sendSuccess(res, resultData, 'Audit logs retrieved successfully');
    } catch (err) {
      return sendError(res, err.message || 'Failed to retrieve audit logs', 500, 'AUDIT_LOG_ERROR');
    }
  }
}

export default new AuditController();
