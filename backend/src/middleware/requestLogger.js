import pinoHttp from 'pino-http';
import logger from '../config/logger.js';

export const requestLogger = pinoHttp({
  logger,
  serializers: { req: (request) => ({ ...request, url: request.url?.split('?')[0], query: undefined }) },
  genReqId: (req, res) => res.locals.requestId || req.headers['x-request-id'] || 'no-id',
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    // Suppress spammy health check logs in normal mode
    if (req.url === '/health' || req.url === '/ready') return 'debug';
    return 'info';
  },
  autoLogging: {
    ignore: (req) => {
      // Do not log static assets to avoid log flooding
      return (
        req.url.startsWith('/assets/') ||
        req.url.endsWith('.png') ||
        req.url.endsWith('.jpg') ||
        req.url.endsWith('.jpeg') ||
        req.url.endsWith('.css') ||
        req.url.endsWith('.js')
      );
    }
  }
});

export default requestLogger;

