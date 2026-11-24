/**
 * IntelliCore Client-Side Authentication Service
 * Version: 2.0.0
 * Environment: Local Development (intellicore-dev)
 * 
 * Integrates Firebase Web SDK with backend identity synchronization (/api/v1/auth/*).
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile as updateFirebaseProfile
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import { firebaseConfig } from './firebase.js';
import { api } from './api.js';

class AuthService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.googleProvider = null;
    this.currentUser = null;
    this.appUserContext = null;
    this.listeners = new Set();
    this.isInitializing = true;
    this.init();
  }

  init() {
    try {
      this.app = initializeApp(firebaseConfig);
      this.auth = getAuth(this.app);
      this.googleProvider = new GoogleAuthProvider();
      this.googleProvider.setCustomParameters({ prompt: 'select_account' });

      // Configure api client with dynamic token provider
      api.setTokenProvider(async () => {
        if (!this.auth?.currentUser) return null;
        try {
          return await this.auth.currentUser.getIdToken(false);
        } catch (err) {
          console.warn('[AuthService] Token refresh error:', err);
          return null;
        }
      });

      // Listen for Firebase Auth state changes
      onAuthStateChanged(this.auth, async (firebaseUser) => {
        this.currentUser = firebaseUser;
        if (firebaseUser) {
          try {
            // Synchronize authenticated identity with MySQL
            const token = await firebaseUser.getIdToken();
            const bootstrapRes = await api.post('/auth/bootstrap', {
              fullName: firebaseUser.displayName,
              photoUrl: firebaseUser.photoURL
            }, {
              headers: { Authorization: `Bearer ${token}` }
            });

            this.appUserContext = bootstrapRes.data || null;
          } catch (err) {
            console.error('[AuthService] Backend identity synchronization error:', err);
            this.appUserContext = null;
          }
        } else {
          this.appUserContext = null;
        }

        this.isInitializing = false;
        this._notify();
      });
    } catch (err) {
      console.error('[AuthService] Firebase Web SDK initialization failed:', err);
      this.isInitializing = false;
    }
  }

  onAuthStateChanged(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
      if (!this.isInitializing) {
        callback(this.getContext());
      }
    }
    return () => this.listeners.delete(callback);
  }

  _notify() {
    const context = this.getContext();
    for (const listener of this.listeners) {
      try {
        listener(context);
      } catch (err) {
        console.error('[AuthService] Auth listener execution error:', err);
      }
    }
  }

  getContext() {
    return {
      firebaseUser: this.currentUser,
      appUser: this.appUserContext,
      isAuthenticated: Boolean(this.currentUser && this.appUserContext),
      status: this.appUserContext?.status || (this.currentUser ? 'PENDING' : 'UNAUTHENTICATED'),
      roles: this.appUserContext?.roles || [],
      permissions: this.appUserContext?.permissions || [],
      workspaces: this.appUserContext?.workspaces || {},
      isInitializing: this.isInitializing
    };
  }

  async loginWithGoogle() {
    if (!this.auth || !this.googleProvider) {
      throw new Error('Authentication service is initializing. Please try again.');
    }
    const credential = await signInWithPopup(this.auth, this.googleProvider);
    return credential.user;
  }

  async loginWithEmail(email, password) {
    if (!this.auth) {
      throw new Error('Authentication service is unavailable.');
    }
    const credential = await signInWithEmailAndPassword(this.auth, email.trim(), password);
    return credential.user;
  }

  async registerWithEmail(email, password, fullName) {
    if (!this.auth) {
      throw new Error('Authentication service is unavailable.');
    }
    const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    const user = credential.user;

    if (fullName) {
      await updateFirebaseProfile(user, { displayName: fullName.trim() });
    }

    try {
      await sendEmailVerification(user);
    } catch (err) {
      console.warn('[AuthService] Initial verification email delivery notice:', err.message);
    }

    return user;
  }

  async sendPasswordReset(email) {
    if (!this.auth) {
      throw new Error('Authentication service is unavailable.');
    }
    return await sendPasswordResetEmail(this.auth, email.trim());
  }

  async resendVerificationEmail() {
    if (!this.auth?.currentUser) {
      throw new Error('No signed-in user found to resend verification.');
    }
    return await sendEmailVerification(this.auth.currentUser);
  }

  async logout() {
    if (!this.auth) return;
    await signOut(this.auth);
    this.currentUser = null;
    this.appUserContext = null;
    this._notify();
  }

  determineDashboardRoute(context = this.getContext()) {
    if (!context.isAuthenticated) return null;

    const { workspaces, status } = context;
    if (status !== 'ACTIVE') {
      return '/#pending-approval';
    }

    if (workspaces.founder) {
      return '/pages/dashboards/founder/index.html';
    }
    if (workspaces.hr) {
      return '/pages/dashboards/hr/index.html';
    }
    if (workspaces.teamLeader) {
      return '/pages/dashboards/team-leader/index.html';
    }
    if (workspaces.intern) {
      return '/pages/dashboards/intern/index.html';
    }

    return '/';
  }
}

export const authService = new AuthService();
export default authService;
