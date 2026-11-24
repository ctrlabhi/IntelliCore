import { Router } from 'express';
import { sendSuccess } from '../utils/response.js';
import { checkDatabaseConnection } from '../config/database.js';
import env from '../config/env.js';
import authRoutes from '../modules/auth/authRoutes.js';

const router = Router();

/**
 * @openapi
 * /api/v1:
 *   get:
 *     summary: API Version 1 Root Metadata
 *     description: Returns metadata about the IntelliCore REST API v1.
 *     responses:
 *       200:
 *         description: API details
 */
router.get('/', (req, res) => {
  return sendSuccess(res, {
    api: 'IntelliCore REST API',
    version: 'v1',
    environment: env.NODE_ENV,
    timezone: env.APP_TIMEZONE,
    docs: '/api-docs',
    endpoints: {
      health: '/api/v1/health',
      swagger: '/api-docs'
    }
  }, 'IntelliCore API v1 operational');
});

/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     summary: Versioned API Health Diagnostic
 *     description: Detailed diagnostics including process uptime and database state.
 *     responses:
 *       200:
 *         description: Diagnostic status
 */
router.get('/health', async (req, res) => {
  const isDbConnected = await checkDatabaseConnection();

  const diagnostic = {
    service: 'intellicore-api',
    version: '2.0.0',
    apiVersion: 'v1',
    uptimeSeconds: Math.floor(process.uptime()),
    database: isDbConnected ? 'CONNECTED' : 'DISCONNECTED',
    memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  };

  if (!isDbConnected) {
    return res.status(503).json({
      success: false,
      data: diagnostic,
      error: {
        code: 'DATABASE_DISCONNECTED',
        message: 'The database is currently unreachable.'
      },
      requestId: res.locals.requestId || null,
      timestamp: new Date().toISOString()
    });
  }

  return sendSuccess(res, diagnostic, 'System operational');
});

// Authentication and Identity Management Routes
router.use('/', authRoutes);

export default router;

