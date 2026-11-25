import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import logger from '../../config/logger.js';
import env from '../../config/env.js';

/**
 * Isolated Firebase Service Abstraction
 * Configured exclusively for local development with intellicore-dev.
 * Production Firebase (intellicore-229) is strictly isolated and forbidden.
 */
export class FirebaseService {
  constructor() {
    this.isInitialized = false;
    this.app = null;
    this.auth = null;
    this.projectId = null;
    this.init();
  }

  init() {
    if (env.NODE_ENV === 'test') return;
    try {
      if (env.FIREBASE_PROJECT_ID !== 'intellicore-dev') {
        throw new Error('Firebase Auth requires the IntelliCore development project.');
      }
      const existingApps = getApps();
      const existingDevApp = existingApps.find(({ options }) => options.projectId === 'intellicore-dev');
      if (existingDevApp) {
        this.app = existingDevApp;
        this.auth = getAuth(this.app);
        this.isInitialized = true;
        this.projectId = this.app.options.projectId || env.FIREBASE_PROJECT_ID;
        return;
      } else if (existingApps.length) {
        throw new Error('An unexpected Firebase app is initialized.');
      }

      // Check configured credential path or fallbacks
      const candidatePaths = [
        env.GOOGLE_APPLICATION_CREDENTIALS,
        '/run/secrets/firebase-admin-dev.json',
        path.resolve(process.cwd(), 'secrets/firebase-admin-dev.json')
      ].filter(Boolean);

      let credPath = null;
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          credPath = p;
          break;
        }
      }

      if (credPath) {
        const keyData = JSON.parse(fs.readFileSync(credPath, 'utf8'));

        // Strict security guardrail: never initialize against production
        if (keyData.project_id !== 'intellicore-dev') {
          throw new Error('Firebase credentials do not belong to the development project.');
        }

        this.app = initializeApp({
          credential: cert(keyData),
          projectId: keyData.project_id
        });

        this.auth = getAuth(this.app);
        this.projectId = keyData.project_id;
        this.isInitialized = true;
        logger.info(`Firebase Admin SDK successfully initialized for development project: ${this.projectId}`);
      } else {
        logger.warn('Firebase Admin SDK credential file not found. Service running in uninitialized mode.');
      }
    } catch (err) {
      logger.error(`Failed to initialize Firebase Admin SDK: ${err.message}`);
    }
  }

  async verifyIdToken(idToken) {
    if (!this.isInitialized || !this.auth) {
      throw new Error('Firebase Admin SDK is not initialized.');
    }
    return await this.auth.verifyIdToken(idToken);
  }

  async deleteUser(uid) {
    if (!this.isInitialized || !this.auth) {
      logger.info({ uid }, 'Firebase Admin SDK not initialized; skipping deleteUser.');
      return true;
    }
    try {
      await this.auth.deleteUser(uid);
      logger.info({ uid }, 'Firebase user deleted successfully.');
      return true;
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        logger.info({ uid }, 'Firebase user already deleted / not found.');
        return true;
      }
      logger.error({ err: err.message, uid }, 'Failed to delete user in Firebase Auth.');
      throw err;
    }
  }

  async revokeRefreshTokens(uid) {
    if (!this.isInitialized || !this.auth) {
      logger.info({ uid }, 'Firebase Admin SDK not initialized; skipping revokeRefreshTokens.');
      return true;
    }
    try {
      await this.auth.revokeRefreshTokens(uid);
      logger.info({ uid }, 'Firebase refresh tokens revoked successfully.');
      return true;
    } catch (err) {
      if (err.code === 'auth/user-not-found') return true;
      logger.warn({ err: err.message, uid }, 'Could not revoke refresh tokens in Firebase Auth.');
      return false;
    }
  }

  getAuth() {
    return this.auth;
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      projectId: this.projectId,
      appCount: getApps().length
    };
  }
}

export const firebaseService = new FirebaseService();
export default firebaseService;



