import { getPrismaClient } from '../../config/database.js';
import { effectivePermissions } from '../../utils/founder.js';
import logger from '../../config/logger.js';

const prisma = getPrismaClient();

export class AuthService {
  /**
   * Synchronizes authenticated Firebase identity with MySQL
   */
  async bootstrapAccount({ firebaseUid, email, emailVerified = false, fullName, photoUrl }) {
    if (!firebaseUid) {
      throw new Error('Firebase UID is required for bootstrap.');
    }
    if (!email) {
      throw new Error('Email address is required for bootstrap.');
    }

    const normalizedEmail = email.trim().toLowerCase();

    return await prisma.$transaction(async (tx) => {
      // 1. Check if user with this firebaseUid already exists
      let user = await tx.user.findUnique({
        where: { firebaseUid },
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
        // User already exists in MySQL: Update login time and verified status
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            emailVerified,
            lastLoginAt: new Date()
          },
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

        // Optionally update profile details if provided and missing
        if ((fullName || photoUrl) && user.profile) {
          const profileUpdates = {};
          if (fullName && !user.profile.fullName) profileUpdates.fullName = fullName.trim();
          if (photoUrl && !user.profile.profilePhotoUrl) profileUpdates.profilePhotoUrl = photoUrl;

          if (Object.keys(profileUpdates).length > 0) {
            await tx.profile.update({
              where: { userId: user.id },
              data: profileUpdates
            });
            user.profile = { ...user.profile, ...profileUpdates };
          }
        }

        logger.info({ userId: user.id, email: normalizedEmail, status: user.status }, 'Existing account authenticated & synchronized');
        return this.formatUserContext(user);
      }

      // 2. New user registration check: prevent account hijacking by matching email
      const existingEmailUser = await tx.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (existingEmailUser) {
        logger.warn({ email: normalizedEmail, existingUid: existingEmailUser.firebaseUid, newUid: firebaseUid }, 'Account bootstrap rejected: email collision');
        const error = new Error('This email address is already associated with another registered identity.');
        error.code = 'EMAIL_ALREADY_REGISTERED';
        error.status = 409;
        throw error;
      }

      // 3. Find default INTERN role for self-registered users
      const defaultRole = await tx.role.findUnique({
        where: { code: 'INTERN' }
      });

      if (!defaultRole) {
        throw new Error('Default INTERN role is not provisioned in database.');
      }

      // 4. Create User (New self-registered users are strictly PENDING)
      const newUser = await tx.user.create({
        data: {
          firebaseUid,
          email: normalizedEmail,
          emailVerified,
          status: 'PENDING',
          lastLoginAt: new Date(),
          profile: {
            create: {
              fullName: fullName?.trim() || normalizedEmail.split('@')[0],
              displayName: fullName?.trim() || normalizedEmail.split('@')[0],
              profilePhotoUrl: photoUrl || null
            }
          },
          userRoles: {
            create: {
              roleId: defaultRole.id,
              assignedBy: 'SYSTEM_BOOTSTRAP'
            }
          }
        },
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

      logger.info({ userId: newUser.id, email: normalizedEmail }, 'New self-registered user initialized with PENDING status');
      return this.formatUserContext(newUser);
    });
  }

  /**
   * Retrieves full sanitized identity and workspace context
   */
  async getUserContext(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    if (!user) {
      const error = new Error('User not found.');
      error.code = 'USER_NOT_FOUND';
      error.status = 404;
      throw error;
    }

    return this.formatUserContext(user);
  }

  /**
   * Updates only permitted profile fields
   */
  async updateProfile(userId, { fullName, displayName, profilePhotoUrl }) {
    const data = {};
    if (fullName !== undefined) data.fullName = fullName.trim();
    if (displayName !== undefined) data.displayName = displayName ? displayName.trim() : null;
    if (profilePhotoUrl !== undefined) data.profilePhotoUrl = profilePhotoUrl ? profilePhotoUrl.trim() : null;

    if (Object.keys(data).length === 0) {
      throw new Error('No valid profile fields provided for update.');
    }

    const updatedProfile = await prisma.profile.update({
      where: { userId },
      data
    });

    return updatedProfile;
  }

  /**
   * Internal helper to sanitize and format user auth context
   */
  formatUserContext(user) {
    const roleCodes = user.userRoles.map((ur) => ur.role.code);
    const permissionSet = new Set();
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        if (rp.permission?.code) {
          permissionSet.add(rp.permission.code);
        }
      }
    }
    const permissions = effectivePermissions(permissionSet, roleCodes, user);

    // Compute authorized workspaces (only active accounts can access workspaces)
    const isActive = user.status === 'ACTIVE' && user.emailVerified;
    const workspaces = {
      founder: isActive && (roleCodes.includes('FOUNDER') || roleCodes.includes('CO_FOUNDER') || permissions.includes('workspace:founder')),
      admin: isActive && (roleCodes.includes('ADMIN') || permissions.includes('workspace:admin')),
      hr: isActive && (roleCodes.includes('HR_MANAGER') || roleCodes.includes('HR_EXECUTIVE') || permissions.includes('workspace:hr')),
      operations: isActive && (roleCodes.includes('OPERATIONS_EXECUTIVE') || permissions.includes('workspace:operations')),
      teamLeader: isActive && (roleCodes.includes('TEAM_LEADER') || permissions.includes('workspace:team_leader')),
      intern: isActive && (roleCodes.includes('INTERN') || permissions.includes('workspace:intern')),
      onboarding: user.emailVerified && user.status === 'PENDING' && roleCodes.includes('INTERN')
    };

    return {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      emailVerified: user.emailVerified,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      profile: user.profile
        ? {
            id: user.profile.id,
            fullName: user.profile.fullName,
            displayName: user.profile.displayName,
            profilePhotoUrl: user.profile.profilePhotoUrl
          }
        : null,
      roles: roleCodes,
      permissions,
      workspaces
    };
  }
}

export const authService = new AuthService();
export default authService;

