import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../config/swagger.js';
import healthRoutes from './health.js';
import apiV1Routes from './apiV1.js';
import { apiRateLimiter } from '../middleware/rateLimiter.js';
import { vercelNotificationCron } from '../modules/notifications/vercelCron.js';

import env from '../config/env.js';

const router = Router();

// Liveness and Readiness probes (unthrottled for Docker & orchestration)
router.use('/', healthRoutes);
router.get('/api/internal/notification-tick', vercelNotificationCron);

// Swagger / OpenAPI documentation UI
const swaggerEnabled = env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true';

if (swaggerEnabled) {
  router.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'IntelliCore API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true
    }
  }));

  // Swagger JSON spec endpoint
  router.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
} else {
  router.all(['/api-docs', '/api-docs/*', '/api-docs.json'], (req, res) => {
    res.status(404).json({
      status: 'error',
      code: 'NOT_FOUND',
      message: 'API documentation is disabled in production.'
    });
  });
}

// Versioned API v1 routes with rate limiting
router.use('/api/v1', apiRateLimiter, apiV1Routes);

export default router;

