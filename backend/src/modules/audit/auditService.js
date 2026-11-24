import { getPrismaClient } from '../../config/database.js';
import logger from '../../config/logger.js';

const prisma = getPrismaClient();

/**
 * Strips sensitive fields (passwords, tokens, secrets) before audit serialization
 */
function sanitizeAuditPayload(data) {
  if (data instanceof Date) return data.toISOString();
  if (!data || typeof data !== 'object') {
    return data;
  }
  const sensitiveKeys = ['password', 'token', 'refreshToken', 'secret', 'authorization', 'credential'];
  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeAuditPayload(sanitized[key]);
    }
  }
  return sanitized;
}

export class AuditService {
  /**
   * Records an audit log entry within an optional existing transaction.
   *
   * @param {object} client - Prisma client or transaction instance (tx)
   * @param {object} logData - Audit details
   * @param {string} [logData.actorUserId] - ID of the user performing the action
   * @param {string} logData.action - Action identifier (e.g. 'USER_STATUS_UPDATED')
   * @param {string} logData.resourceType - Type of entity modified (e.g. 'USER', 'STAFF_PROFILE')
   * @param {string} [logData.resourceId] - Target entity identifier
   * @param {object} [logData.beforeState] - Previous state before mutation
   * @param {object} [logData.afterState] - New state after mutation
   * @param {string} [logData.requestId] - Unique HTTP request tracking ID
   * @param {string} [logData.result] - 'SUCCESS' or 'FAILURE'
   */
  async createAuditLog(client, {
    actorUserId = null,
    action,
    resourceType,
    resourceId = null,
    beforeState = null,
    afterState = null,
    requestId = null,
    result = 'SUCCESS'
  }) {
    const db = client || prisma;
    try {
      const sanitizedBefore = beforeState ? JSON.stringify(sanitizeAuditPayload(beforeState)) : null;
      const sanitizedAfter = afterState ? JSON.stringify(sanitizeAuditPayload(afterState)) : null;

      const record = await db.auditLog.create({
        data: {
          actorUserId,
          action,
          resourceType,
          resourceId: resourceId ? String(resourceId) : null,
          sanitizedBefore,
          sanitizedAfter,
          requestId,
          result
        }
      });

      return record;
    } catch (err) {
      // Audit log failures should be heavily logged but not inevitably crash read operations
      logger.error({ err: err.message, action, resourceType, resourceId }, 'Failed to record audit log');
      throw err;
    }
  }

  /**
   * Retrieves paginated audit logs with optional filtering.
   */
  async listAuditLogs({
    page = 1,
    limit = 20,
    actorUserId = null,
    action = null,
    resourceType = null,
    result = null,
    startDate = null,
    endDate = null
  } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (actorUserId) where.actorUserId = actorUserId;
    if (action) where.action = { contains: action };
    if (resourceType) where.resourceType = resourceType;
    if (result) where.result = result;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          actorUser: {
            select: {
              id: true,
              email: true,
              profile: {
                select: {
                  fullName: true,
                  profilePhotoUrl: true
                }
              }
            }
          }
        }
      })
    ]);

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      actor: log.actorUser
        ? {
            id: log.actorUser.id,
            email: log.actorUser.email,
            name: log.actorUser.profile?.fullName || 'User'
          }
        : { id: null, email: 'SYSTEM', name: 'System / Automated' },
      beforeState: log.sanitizedBefore ? JSON.parse(log.sanitizedBefore) : null,
      afterState: log.sanitizedAfter ? JSON.parse(log.sanitizedAfter) : null,
      requestId: log.requestId,
      result: log.result,
      createdAt: log.createdAt
    }));

    return {
      logs: formattedLogs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }
}

export default new AuditService();
