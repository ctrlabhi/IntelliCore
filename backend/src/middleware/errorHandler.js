import logger from '../config/logger.js';
import { sendError } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

/**
 * Centralized Application Error Handling Middleware
 */
export function errorHandler(err, req, res, next) {
  // If response headers have already been sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  const requestId = res.locals.requestId || req.headers['x-request-id'] || 'no-id';

  // Log error with structured context
  logger.error({
    err: {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  }, 'Request error encountered');

  // Handle known operational AppError instances
  if (err instanceof AppError) {
    return sendError(res, err.message, err.statusCode, err.code, err.details);
  }

  // Handle Zod Schema Validation Errors
  if (err.name === 'ZodError') {
    return sendError(res, 'Request validation failed', 400, 'VALIDATION_ERROR', err.errors);
  }

  // Handle SyntaxError (e.g. malformed JSON in request body)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return sendError(res, 'Malformed JSON payload in request body', 400, 'BAD_REQUEST');
  }

  // Generic internal server error (obscure internal stack trace in production)
  const isDev = process.env.NODE_ENV === 'development';
  const message = isDev ? err.message : 'An internal server error occurred.';
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  return sendError(res, message, 500, code);
}

export default errorHandler;

