import app from './app.js';
import env from './config/env.js';
import logger from './config/logger.js';
import { disconnectDatabase, checkDatabaseConnection } from './config/database.js';

const PORT = parseInt(process.env.PORT || env.PORT || 3000, 10);
const HOST = '0.0.0.0';

const server = app.listen(PORT, HOST, async () => {
  logger.info(`========================================================`);
  logger.info(`🚀 IntelliCore Modular Monolith v2.0.0 started`);
  logger.info(`🌐 Application URL:    ${env.APP_BASE_URL}`);
  logger.info(`📡 API Base URL:       ${env.APP_BASE_URL}/api/v1`);
  logger.info(`📖 Swagger Docs:       ${env.APP_BASE_URL}/api-docs`);
  logger.info(`💓 Health Endpoint:    ${env.APP_BASE_URL}/health`);
  logger.info(`⏳ Readiness Endpoint: ${env.APP_BASE_URL}/ready`);
  logger.info(`🕒 Timezone:           ${env.APP_TIMEZONE}`);
  logger.info(`⚙️  Environment:        ${env.NODE_ENV}`);
  logger.info(`========================================================`);

  // Non-blocking check for database connectivity at startup
  const dbReady = await checkDatabaseConnection();
  if (dbReady) {
    logger.info('✅ MySQL Database connected successfully via Prisma.');
  } else {
    logger.warn('⚠️  MySQL Database is not yet reachable. Readiness probe /ready will report 503 until connected.');
  }
});

// -----------------------------------------------------------------------------
// Graceful Shutdown Handler
// -----------------------------------------------------------------------------
let isShuttingDown = false;

async function handleGracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Received shutdown signal. Commencing graceful termination...');

  // Force shutdown after 10 seconds timeout
  const forceExitTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
    process.exit(1);
  }, 10000);

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error closing HTTP server.');
      process.exit(1);
    }

    logger.info('HTTP server closed. Disconnecting database...');
    await disconnectDatabase();
    clearTimeout(forceExitTimeout);
    logger.info('Graceful shutdown completed successfully.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason }, 'Unhandled Promise Rejection encountered');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception encountered. Exiting immediately.');
  process.exit(1);
});

export default server;

