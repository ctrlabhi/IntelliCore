import { getPrismaClient } from '../config/database.js';
import firebaseService from '../integrations/firebase/firebaseService.js';
import { sendError } from '../utils/response.js';
import logger from '../config/logger.js';
import env from '../config/env.js';
import { effectivePermissions, matchesFounderIdentity } from '../utils/founder.js';

const prisma = getPrismaClient();

/**
 * Authentication Middleware
 * Validates Firebase ID Token and resolves MySQL User & RBAC Context.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'Authentication required. Authorization header missing or malformed.', 401, 'UNAUTHENTICATED');
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) {
      return sendError(res, 'Bearer token is missing.', 401, 'INVALID_TOKEN');
    }

    // Verify token with Firebase Admin SDK
    let decodedToken;
    try {
      decodedToken = await firebaseService.verifyIdToken(token);
    } catch (err) {
      logger.warn({ err: err.message }, 'Firebase token verification failed');
      return sendError(res, 'Invalid or expired authentication token.', 401, 'INVALID_TOKEN');
    }

    // Enforce configured development Firebase project allowlist
    const expectedProject = env.FIREBASE_PROJECT_ID || 'intellicore-dev';
    const tokenAud = decodedToken.aud;
    if (expectedProject !== 'intellicore-dev' || tokenAud !== expectedProject) {
      logger.error({ tokenAud, expectedProject }, 'Token issued for unauthorized Firebase project');
      return sendError(res, 'Security violation: Token issued for unauthorized project.', 403, 'WRONG_PROJECT');
    }

    req.firebaseUser = decodedToken;

    // Resolve user in MySQL
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
      include: {
        profile: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (user) {
      req.user = user;
      req.profile = user.profile;

      // Extract unique role and permission codes
      const roleCodes = user.userRoles.map((ur) => ur.role.code);
      const permissionSet = new Set();
      for (const ur of user.userRoles) {
        for (const rp of ur.role.rolePermissions) {
          if (rp.permission?.code) {
            permissionSet.add(rp.permission.code);
          }
        }
      }

      req.roles = roleCodes;
      req.permissions = effectivePermissions(permissionSet, roleCodes, user);
    } else {
      req.user = null;
      req.profile = null;
      req.roles = [];
      req.permissions = [];
    }

    return next();
  } catch (err) {
    logger.error({ err }, 'Error during authentication processing');
    return sendError(res, 'Authentication service temporarily unavailable.', 503, 'AUTH_UNAVAILABLE');
  }
}

/**
 * Ensures user has been synchronized with MySQL
 */
export function requireAuth(req, res, next) {
  if (!req.firebaseUser) {
    return sendError(res, 'Authentication required.', 401, 'UNAUTHENTICATED');
  }
  if (!req.user) {
    return sendError(res, 'User account is not yet synchronized with the database. Please complete bootstrap.', 401, 'ACCOUNT_NOT_BOOTSTRAPPED');
  }
  return next();
}

/**
 * Enforce minimum account status (default: ACTIVE)
 */
export function requireStatus(allowedStatuses = ['ACTIVE']) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required.', 401, 'UNAUTHENTICATED');
    }

    if (!allowedStatuses.includes(req.user.status)) {
      return sendError(
        res,
        `Account access restricted. Current account status: ${req.user.status}.`,
        403,
        'ACCOUNT_STATUS_RESTRICTED',
        { status: req.user.status, allowed: allowedStatuses }
      );
    }

    return next();
  };
}

export function requireVerifiedEmail(req, res, next) {
  if (req.firebaseUser?.email_verified !== true) {
    return sendError(res, 'Verify your email to continue.', 403, 'EMAIL_VERIFICATION_REQUIRED');
  }
  return next();
}

export function requirePrimaryFounder(req, res, next) {
  return requireRole('FOUNDER')(req, res, () => {
    if (!matchesFounderIdentity(req.user)) {
      return sendError(res, 'Only the primary Founder may perform this operation.', 403, 'FOUNDER_REQUIRED');
    }
    return next();
  });
}

function hasVerifiedPasswordIdentity(req, res) {
  if (req.firebaseUser?.firebase?.sign_in_provider === 'password' && req.firebaseUser.email_verified !== true) {
    sendError(res, 'Verify your email to continue.', 403, 'EMAIL_VERIFICATION_REQUIRED');
    return false;
  }
  return true;
}

/**
 * Enforce required roles (User must have at least one of the specified roles)
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required.', 401, 'UNAUTHENTICATED');
    }

    if (req.user.status !== 'ACTIVE') {
      return sendError(
        res,
        `Account access restricted. Current account status: ${req.user.status}.`,
        403,
        'ACCOUNT_STATUS_RESTRICTED',
        { status: req.user.status }
      );
    }

    const hasRole = allowedRoles.some((role) => req.roles.includes(role));
    if (!hasVerifiedPasswordIdentity(req, res)) return;
    if (!hasRole) {
      return sendError(
        res,
        'Access denied: You do not have the required role for this resource.',
        403,
        'FORBIDDEN_ROLE',
        { requiredRoles: allowedRoles, currentRoles: req.roles }
      );
    }

    return next();
  };
}

/**
 * Enforce required permissions (User must have all specified permissions)
 */
export function requirePermission(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required.', 401, 'UNAUTHENTICATED');
    }

    if (req.user.status !== 'ACTIVE') {
      return sendError(
        res,
        `Account access restricted. Current account status: ${req.user.status}.`,
        403,
        'ACCOUNT_STATUS_RESTRICTED',
        { status: req.user.status }
      );
    }

    const hasAll = requiredPermissions.every((perm) => req.permissions.includes(perm));
    if (!hasVerifiedPasswordIdentity(req, res)) return;
    if (!hasAll) {
      return sendError(
        res,
        'Access denied: Insufficient permissions for this operation.',
        403,
        'FORBIDDEN_PERMISSION',
        { requiredPermissions, currentPermissions: req.permissions }
      );
    }

    return next();
  };
}

