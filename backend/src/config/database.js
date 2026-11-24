import { PrismaClient } from '@prisma/client';
import logger from './logger.js';
import env from './env.js';

// Global singleton instance for Prisma
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: env.NODE_ENV === 'development'
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' }
      ]
    : [{ emit: 'event', level: 'error' }]
});

if (env.NODE_ENV === 'development') {
  prisma.$on('error', (e) => logger.error({ err: e }, 'Prisma Database Error'));
  prisma.$on('warn', (e) => logger.warn({ warning: e }, 'Prisma Database Warning'));
}

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Verifies active database connection with a direct ping query.
 * Returns true if healthy, false otherwise.
 */
export async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1 as ping`;
    return true;
  } catch (err) {
    logger.warn({ err: err.message }, 'Database healthcheck failed');
    return false;
  }
}

/**
 * Graceful database disconnect
 */
export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected gracefully.');
  } catch (err) {
    logger.error({ err }, 'Error during Prisma disconnection.');
  }
}

export function getPrismaClient() {
  return prisma;
}

export default prisma;

