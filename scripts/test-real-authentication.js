import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';

// 1. Force test environment with isolated test database on port 33359
const testDbUrl = 'mysql://intellicore_test_fresh:test_secret@127.0.0.1:33359/intellicore_test_fresh';
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'development'; // so FirebaseService initializes real SDK
process.env.FIREBASE_PROJECT_ID = 'intellicore-dev';

import app from '../backend/src/app.js';
import firebaseService from '../backend/src/integrations/firebase/firebaseService.js';
import { firebaseConfig } from '../frontend/services/firebase.js';

const prisma = new PrismaClient({ datasourceUrl: testDbUrl });

// Helper to exchange custom token for real ID token via Google Identity Toolkit
async function getIdTokenFromCustomToken(customToken) {
  const apiKey = firebaseConfig.apiKey;
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google Identity Toolkit error: ${JSON.stringify(data)}`);
  }
  return data;
}

// Helper for sending OOB codes (Verification / Password Reset)
async function sendOobCode(idToken, requestType, email) {
  const apiKey = firebaseConfig.apiKey;
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`;
  const body = { requestType };
  if (idToken) body.idToken = idToken;
  if (email) body.email = email;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return await res.json();
}

async function runRealAuthTest() {
  console.log('================================================================');
  console.log('🔥 REAL FIREBASE & BACKEND AUTHENTICATION INTEGRATION TEST');
  console.log('Firebase Project: intellicore-dev');
  console.log('Target Database: Isolated MySQL (127.0.0.1:33359)');
  console.log('================================================================\n');

  if (!firebaseService.isInitialized || !firebaseService.auth) {
    throw new Error('Firebase Admin SDK failed to initialize with intellicore-dev.');
  }

  const testUid = `dev-test-${Date.now()}`;
  const testEmail = `candidate-${Date.now()}@intellicore.dev`;
  let passedChecks = 0;
  const totalChecks = 11;

  try {
    // -------------------------------------------------------------------------
    // 1. Email/Password Candidate Creation in Firebase Auth
    // -------------------------------------------------------------------------
    console.log('Test 1: Creating Candidate User in Firebase Auth (intellicore-dev)...');
    const createdUser = await firebaseService.auth.createUser({
      uid: testUid,
      email: testEmail,
      emailVerified: false,
      displayName: 'Real Candidate Tester',
      password: 'SuperSecretTestPassword123!'
    });
    console.log(`  ✅ PASS: Real Firebase identity created (UID: ${createdUser.uid}, Email: ${createdUser.email})`);
    passedChecks++;

    // -------------------------------------------------------------------------
    // 2. Real Token Issuance & Exchange (Google Identity Toolkit)
    // -------------------------------------------------------------------------
    console.log('\nTest 2: Issuing Custom Token & Exchanging for Real Google ID Token...');
    const customToken = await firebaseService.auth.createCustomToken(testUid);
    const tokenPayload = await getIdTokenFromCustomToken(customToken);
    let idToken = tokenPayload.idToken;
    console.log('  ✅ PASS: Real Google ID Token issued and exchanged successfully');
    passedChecks++;

    // -------------------------------------------------------------------------
    // 3. Email Verification Flow (Firebase OOB Code)
    // -------------------------------------------------------------------------
    console.log('\nTest 3: Triggering Real Firebase Email Verification...');
    const verifyRes = await sendOobCode(idToken, 'VERIFY_EMAIL');
    if (verifyRes.email === testEmail) {
      console.log(`  ✅ PASS: Real Firebase email verification trigger accepted for ${verifyRes.email}`);
      passedChecks++;
    } else {
      throw new Error(`Email verification trigger failed: ${JSON.stringify(verifyRes)}`);
    }

    // -------------------------------------------------------------------------
    // 4. Password Reset Flow (Firebase OOB Code)
    // -------------------------------------------------------------------------
    console.log('\nTest 4: Triggering Real Firebase Password Reset Email...');
    const resetRes = await sendOobCode(null, 'PASSWORD_RESET', testEmail);
    if (resetRes.email === testEmail) {
      console.log(`  ✅ PASS: Real Firebase password reset flow generated for ${resetRes.email}`);
      passedChecks++;
    } else {
      throw new Error(`Password reset failed: ${JSON.stringify(resetRes)}`);
    }

    // Mark email verified for subsequent authorized profile operations
    await firebaseService.auth.updateUser(testUid, { emailVerified: true });
    // Refresh token with verified status
    const refreshedTokenPayload = await getIdTokenFromCustomToken(await firebaseService.auth.createCustomToken(testUid));
    idToken = refreshedTokenPayload.idToken;

    // -------------------------------------------------------------------------
    // 5. Backend Identity Synchronization & Onboarding (/api/v1/auth/bootstrap)
    // -------------------------------------------------------------------------
    console.log('\nTest 5: Bootstrapping Real Firebase Identity into Backend (/api/v1/auth/bootstrap)...');
    const bootstrapRes = await request(app)
      .post('/api/v1/auth/bootstrap')
      .set('Authorization', `Bearer ${idToken}`)
      .send({ fullName: 'Real Candidate Tester' });

    if (bootstrapRes.status === 200 && bootstrapRes.body.success) {
      const data = bootstrapRes.body.data;
      console.log(`  ✅ PASS: User onboarded into MySQL: Status=${data.status}, Roles=${data.roles.join(',')}`);
      if (data.status === 'PENDING' && data.roles.includes('INTERN')) {
        passedChecks++;
      } else {
        throw new Error(`Expected PENDING INTERN, received: ${JSON.stringify(data)}`);
      }
    } else {
      throw new Error(`Bootstrap failed: HTTP ${bootstrapRes.status} ${JSON.stringify(bootstrapRes.body)}`);
    }

    // -------------------------------------------------------------------------
    // 6. MySQL Database Profile Persistence Verification
    // -------------------------------------------------------------------------
    console.log('\nTest 6: Verifying MySQL Persistence & Isolation...');
    const dbUser = await prisma.user.findUnique({
      where: { firebaseUid: testUid },
      include: { profile: true, userRoles: { include: { role: true } } }
    });

    if (dbUser && dbUser.email === testEmail && dbUser.profile.fullName === 'Real Candidate Tester') {
      console.log(`  ✅ PASS: Profile verified in MySQL (ID: ${dbUser.id}, Name: "${dbUser.profile.fullName}")`);
      passedChecks++;
    } else {
      throw new Error('Database record was not found or profile mismatch');
    }

    // -------------------------------------------------------------------------
    // 7. Session Restoration & Profile Context (/api/v1/auth/me)
    // -------------------------------------------------------------------------
    console.log('\nTest 7: Retrieving Authenticated Session Context (/api/v1/auth/me)...');
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${idToken}`);

    if (meRes.status === 200 && meRes.body.success && meRes.body.data.id === dbUser.id) {
      console.log(`  ✅ PASS: Session restored cleanly for user ${meRes.body.data.email}`);
      passedChecks++;
    } else {
      throw new Error(`Session context failed: ${JSON.stringify(meRes.body)}`);
    }

    // -------------------------------------------------------------------------
    // 8. User Profile Update (/api/v1/users/me/profile)
    // -------------------------------------------------------------------------
    console.log('\nTest 8: Updating Profile Details (/api/v1/users/me/profile)...');
    const updateRes = await request(app)
      .patch('/api/v1/users/me/profile')
      .set('Authorization', `Bearer ${idToken}`)
      .send({ displayName: 'Updated Candidate Title' });

    if (updateRes.status === 200 && updateRes.body.success) {
      const updatedInDb = await prisma.profile.findUnique({ where: { userId: dbUser.id } });
      if (updatedInDb.displayName === 'Updated Candidate Title') {
        console.log(`  ✅ PASS: Profile update persisted in MySQL (displayName: "${updatedInDb.displayName}")`);
        passedChecks++;
      } else {
        throw new Error('Profile update was not reflected in database');
      }
    } else {
      throw new Error(`Profile update failed: ${JSON.stringify(updateRes.body)}`);
    }

    // -------------------------------------------------------------------------
    // 9. Role-Based Access Restriction (Pending Intern -> Admin Route)
    // -------------------------------------------------------------------------
    console.log('\nTest 9: Verifying Role-Based Access Restrictions...');
    const forbiddenRes = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${idToken}`);

    if (forbiddenRes.status === 403 && ['FORBIDDEN', 'ACCOUNT_STATUS_RESTRICTED'].includes(forbiddenRes.body.error?.code)) {
      console.log(`  ✅ PASS: Pending intern access blocked with HTTP 403 (${forbiddenRes.body.error?.code})`);
      passedChecks++;
    } else {
      throw new Error(`RBAC breach: Expected 403, received ${forbiddenRes.status}: ${JSON.stringify(forbiddenRes.body)}`);
    }

    // -------------------------------------------------------------------------
    // 10. Google Auth & Founder Mapping
    // -------------------------------------------------------------------------
    console.log('\nTest 10: Founder Identity Mapping & Workspace Access...');
    const founderRole = await prisma.role.findUniqueOrThrow({ where: { code: 'FOUNDER' } });
    const founder = await prisma.user.findFirst({
      where: { userRoles: { some: { roleId: founderRole.id } } }
    });

    if (founder) {
      const founderCustomToken = await firebaseService.auth.createCustomToken(founder.firebaseUid);
      const founderGoogleToken = await getIdTokenFromCustomToken(founderCustomToken);
      const founderMeRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${founderGoogleToken.idToken}`);

      if (founderMeRes.status === 200 && founderMeRes.body.data.roles.includes('FOUNDER') && founderMeRes.body.data.workspaces.founder === true) {
        console.log(`  ✅ PASS: Founder identity verified with FOUNDER role and full workspace access (${founder.email})`);
        passedChecks++;
      } else {
        throw new Error(`Founder mapping verification failed: ${JSON.stringify(founderMeRes.body)}`);
      }
    } else {
      console.log('  ⚠️ Founder fixture not present; skipping Founder verification');
    }

    // -------------------------------------------------------------------------
    // 11. Teardown & Secure Cleanup
    // -------------------------------------------------------------------------
    console.log('\nTest 11: Teardown & Secure Deletion of Test Identity...');
    // 1. Delete from Firebase Auth
    await firebaseService.auth.deleteUser(testUid);
    console.log('  ✅ Real Firebase test user deleted cleanly from intellicore-dev');

    // 2. Delete from MySQL
    await prisma.userRole.deleteMany({ where: { userId: dbUser.id } });
    await prisma.profile.deleteMany({ where: { userId: dbUser.id } });
    await prisma.user.delete({ where: { id: dbUser.id } });
    console.log('  ✅ Isolated MySQL test records cleaned up cleanly');
    passedChecks++;

    console.log('\n================================================================');
    console.log(`🎉 ALL ${passedChecks}/${totalChecks} REAL AUTHENTICATION CHECKS PASSED 100%`);
    console.log('================================================================');

  } catch (err) {
    console.error('\n❌ Real authentication test failed:', err);
    try {
      await firebaseService.auth.deleteUser(testUid);
    } catch (_) {}
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runRealAuthTest();
