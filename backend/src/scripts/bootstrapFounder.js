import { getPrismaClient } from '../config/database.js';
import firebaseService from '../integrations/firebase/firebaseService.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { syncAttendanceEligibility } from '../modules/attendance/eligibility.js';

const prisma = getPrismaClient();

export async function bootstrapFounder() {
  console.log('👑 Initiating secure Founder account initialization...');

  // 1. Enforce development project boundaries
  const currentProject = env.FIREBASE_PROJECT_ID || 'intellicore-dev';
  if (currentProject !== 'intellicore-dev') {
    throw new Error(`SECURITY HALT: Founder bootstrap can only run on development project (intellicore-dev). Target: ${currentProject}`);
  }

  // 2. Validate environment configuration
  const founderUid = env.FOUNDER_FIREBASE_UID;
  const founderEmail = env.FOUNDER_EMAIL;

  if (!founderUid || founderUid === 'PENDING_CONFIRMATION') {
    console.error('❌ FOUNDER_FIREBASE_UID is not configured or pending confirmation in .env.');
    console.error('   Please complete legitimate Google authentication in the development environment and set FOUNDER_FIREBASE_UID.');
    process.exit(1);
  }

  if (!founderEmail) {
    console.error('❌ FOUNDER_EMAIL is not configured in .env.');
    process.exit(1);
  }

  const normalizedEmail = founderEmail.trim().toLowerCase();

  // 3. Verify identity directly with Firebase Admin Auth
  const auth = firebaseService.getAuth();
  if (!auth) {
    throw new Error('Firebase Admin Auth service is uninitialized.');
  }

  let firebaseUserRecord;
  try {
    firebaseUserRecord = await auth.getUser(founderUid);
  } catch (err) {
    throw new Error('Failed to retrieve the configured Founder from development Firebase Auth.');
  }

  if (firebaseUserRecord.email?.toLowerCase() !== normalizedEmail) {
    throw new Error('The verified Firebase email does not match the configured Founder.');
  }

  if (firebaseUserRecord.disabled) {
    throw new Error('Firebase user account is currently disabled.');
  }
  if (!firebaseUserRecord.emailVerified) {
    throw new Error('The configured Founder must verify their Firebase email.');
  }

  console.log('  ✓ Development Firebase Founder identity verified.');

  // 4. Atomic database transaction to initialize or upgrade Founder
  const result = await prisma.$transaction(async (tx) => {
    // Check if role FOUNDER exists
    const founderRole = await tx.role.findUnique({
      where: { code: 'FOUNDER' }
    });

    if (!founderRole) {
      throw new Error('System FOUNDER role does not exist. Please run prisma/seed.js first.');
    }

    // Check for conflicting primary founder
    const existingFounderAssignment = await tx.userRole.findFirst({
      where: { roleId: founderRole.id },
      include: { user: true }
    });

    if (existingFounderAssignment && existingFounderAssignment.user.firebaseUid !== founderUid) {
      throw new Error('Conflicting primary founder exists. Conflicting assignment rejected.');
    }

    // Resolve or create user
    let user = await tx.user.findUnique({
      where: { firebaseUid: founderUid },
      include: { profile: true }
    });

    if (user) {
      user = await tx.user.update({
        where: { id: user.id },
        data: {
          email: normalizedEmail,
          emailVerified: true,
          status: 'ACTIVE'
        },
        include: { profile: true }
      });
    } else {
      user = await tx.user.create({
        data: {
          firebaseUid: founderUid,
          email: normalizedEmail,
          emailVerified: true,
          status: 'ACTIVE',
          profile: {
            create: {
              fullName: firebaseUserRecord.displayName || 'Founder',
              displayName: firebaseUserRecord.displayName || 'Founder',
              profilePhotoUrl: firebaseUserRecord.photoURL || null
            }
          }
        },
        include: { profile: true }
      });
    }

    // Ensure FOUNDER role is assigned
    await tx.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: founderRole.id
        }
      },
      update: {},
      create: {
        userId: user.id,
        roleId: founderRole.id,
        assignedBy: 'CLI_FOUNDER_BOOTSTRAP'
      }
    });

    // Remove inappropriate default INTERN role if assigned to Founder
    const internRole = await tx.role.findUnique({
      where: { code: 'INTERN' }
    });
    if (internRole) {
      await tx.userRole.deleteMany({
        where: {
          userId: user.id,
          roleId: internRole.id
        }
      });
    }

    await syncAttendanceEligibility(tx, user.id);
    return user;
  }, { isolationLevel: 'ReadCommitted' });

  console.log('✅ Founder account initialized with ACTIVE status.');
  return result;
}

// Execute directly if invoked via CLI
if (process.argv[1]?.endsWith('bootstrapFounder.js')) {
  bootstrapFounder()
    .catch((err) => {
      console.error('❌ Founder bootstrap failed:', err.message);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

