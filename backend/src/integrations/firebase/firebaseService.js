import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import logger from '../../config/logger.js';
import env from '../../config/env.js';

/**
 * Isolated Firebase Service Abstraction
 * Configured for local development with intellicore-dev,
 * and configurable for production deployments via secure Vercel environment variables.
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
      const isProduction = env.NODE_ENV === 'production' || process.env.VERCEL === '1';
      const targetProjectId = env.FIREBASE_PROJECT_ID || 'intellicore-dev';

      // Local development strict quarantine: never point local dev at production
      if (!isProduction && targetProjectId !== 'intellicore-dev') {
        throw new Error('Firebase Auth requires the IntelliCore development project (intellicore-dev) in local development.');
      }

      const existingApps = getApps();
      const existingApp = existingApps.find(({ options }) => options.projectId === targetProjectId);
      if (existingApp) {
        this.app = existingApp;
        this.auth = getAuth(this.app);
        this.isInitialized = true;
        this.projectId = this.app.options.projectId || targetProjectId;
        return;
      } else if (existingApps.length) {
        throw new Error('An unexpected Firebase app is initialized.');
      }

      const hosted = process.env.VERCEL === '1';
      let keyData = null;

      // 1. Check for individual Vercel environment variables (recommended for Vercel)
      if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        const normalizedPrivateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
        keyData = {
          project_id: targetProjectId,
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          private_key: normalizedPrivateKey
        };
      }
      // 2. Check for raw serialized JSON string (alternative for Vercel)
      else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
          keyData = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
          if (keyData.private_key) {
            keyData.private_key = keyData.private_key.replace(/\\n/g, '\n');
          }
        } catch {
          throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
        }
      }
      // 3. Fallback to local files for Docker / standalone local development
      else if (!hosted) {
        const candidatePaths = [
          env.GOOGLE_APPLICATION_CREDENTIALS,
          '/run/secrets/firebase-admin-dev.json',
          path.resolve(process.cwd(), 'secrets/firebase-admin-dev.json')
        ].filter(Boolean);
        const credPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
        if (credPath) {
          const raw = fs.readFileSync(credPath, 'utf8');
          keyData = JSON.parse(raw);
        }
      }

      if (keyData) {
        // Enforce project alignment
        if (!isProduction && keyData.project_id !== 'intellicore-dev') {
          throw new Error('Firebase credentials do not belong to the development project (intellicore-dev).');
        }
        if (isProduction && targetProjectId && keyData.project_id !== targetProjectId) {
          throw new Error(
            `Firebase service account project (${keyData.project_id}) does not match configured FIREBASE_PROJECT_ID (${targetProjectId}).`
          );
        }

        this.app = initializeApp({
          credential: cert(keyData),
          projectId: keyData.project_id
        });

        this.auth = getAuth(this.app);
        this.projectId = keyData.project_id;
        this.isInitialized = true;
        logger.info(`Firebase Admin SDK successfully initialized for project: ${this.projectId}`);
      } else {
        logger.warn('Firebase Admin SDK credentials are unavailable. Service running in uninitialized mode.');
      }
    } catch (err) {
      logger.error({ code: 'FIREBASE_INITIALIZATION_FAILED', err: err.message }, 'Failed to initialize Firebase Admin SDK.');
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
