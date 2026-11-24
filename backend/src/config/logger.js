import pino from 'pino';
import env from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'intellicore-api',
    version: '2.0.0',
    env: env.NODE_ENV
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'secret'],
    censor: '[REDACTED]'
  },
  transport: env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname'
        }
      }
    : undefined
});

export default logger;

