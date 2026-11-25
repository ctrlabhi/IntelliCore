import { AppError } from './errors.js';

export function assertRecentAuthentication(req, now = Date.now()) {
  const authenticatedAt = req.firebaseUser?.auth_time;
  const age = now / 1000 - authenticatedAt;
  if (!Number.isFinite(authenticatedAt) || age < -30 || age > 600) {
    throw new AppError('Sign in again before performing this action.', 403, 'RECENT_AUTHENTICATION_REQUIRED');
  }
}
