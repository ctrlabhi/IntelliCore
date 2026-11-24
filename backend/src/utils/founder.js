import env from '../config/env.js';

export const founderOnlyPermissions = [
  'staff:create',
  'roles:assign',
  'roles:manage_permissions',
  'departments:create',
  'departments:update',
  'departments:assign_staff'
];

export function matchesFounderIdentity(user) {
  return Boolean(env.FOUNDER_FIREBASE_UID && env.FOUNDER_EMAIL
    && user.firebaseUid === env.FOUNDER_FIREBASE_UID
    && user.email?.toLowerCase() === env.FOUNDER_EMAIL.toLowerCase());
}

export function effectivePermissions(permissions, roles, user) {
  if (roles.includes('FOUNDER') && matchesFounderIdentity(user)) return [...permissions];
  return [...permissions].filter((permission) => !founderOnlyPermissions.includes(permission));
}

export function isProtectedFounder(user) {
  return user.userRoles.some(({ role }) => role.code === 'FOUNDER')
    || Boolean(env.FOUNDER_FIREBASE_UID && user.firebaseUid === env.FOUNDER_FIREBASE_UID)
    || Boolean(env.FOUNDER_EMAIL && user.email?.toLowerCase() === env.FOUNDER_EMAIL.toLowerCase());
}
