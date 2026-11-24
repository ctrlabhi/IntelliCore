import { Router } from 'express';
import { checkDatabaseConnection } from '../config/database.js';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Application Liveness Probe
 *     description: Returns HTTP 200 if the Express application process is running.
 *     responses:
 *       200:
 *         description: Application is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "UP" }
 *                 service: { type: string, example: "intellicore-api" }
 *                 version: { type: string, example: "2.0.0" }
 *                 timestamp: { type: string, format: date-time }
 */
router.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'UP',
    service: 'intellicore-api',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * @openapi
 * /ready:
 *   get:
 *     summary: Infrastructure Readiness Probe
 *     description: Verifies active MySQL database connectivity via Prisma. Returns HTTP 503 if database is disconnected.
 *     responses:
 *       200:
 *         description: Application and database are ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "READY" }
 *                 database: { type: string, example: "CONNECTED" }
 *                 timestamp: { type: string, format: date-time }
 *       503:
 *         description: Database is unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "NOT_READY" }
 *                 database: { type: string, example: "DISCONNECTED" }
 *                 timestamp: { type: string, format: date-time }
 */
router.get('/ready', async (req, res) => {
  const isDbConnected = await checkDatabaseConnection();

  if (isDbConnected) {
    return res.status(200).json({
      status: 'READY',
      database: 'CONNECTED',
      timestamp: new Date().toISOString()
    });
  }

  return res.status(503).json({
    status: 'NOT_READY',
    database: 'DISCONNECTED',
    timestamp: new Date().toISOString()
  });
});

export default router;

