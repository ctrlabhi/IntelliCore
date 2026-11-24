import rateLimit from 'express-rate-limit';
import env from '../config/env.js';
import { sendError } from '../utils/response.js';

/**
 * General API Rate Limiter
 * Applied exclusively to /api/* routes
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return sendError(
      res,
      'Too many requests from this IP address. Please try again after 15 minutes.',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }
});

export default apiRateLimiter;

