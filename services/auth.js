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
  reload,
  signOut,
  onAuthStateChanged,
  updateProfile as updateFirebaseProfile
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import { firebaseConfig as defaultFirebaseConfig } from './firebase.js';
import { api } from './api.js';
import { signOutWithAttendance } from './attendance-logout.js';

class AuthService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.googleProvider = null;
    this.currentUser = null;
    this.appUserContext = null;
    this.listeners = new Set();
    this.isInitializing = true;
    this.readyPromise = this.init();
  }

  async resolveFirebaseConfig() {
    if (typeof window !== 'undefined' && window.__INTELLICORE_FIREBASE_CONFIG__) {
      return window.__INTELLICORE_FIREBASE_CONFIG__;
    }
    try {
      const response = await api.get('/auth/config', { timeoutMs: 5000 });
      if (response?.data?.projectId && response?.data?.apiKey) {
        return { isConfigured: true, ...response.data };
      }
    } catch (err) {
      console.warn('[AuthService] Falling back to static Firebase config:', err.message);
    }
    return defaultFirebaseConfig;
  }

  async init() {
    try {
      const effectiveConfig = await this.resolveFirebaseConfig();
      this.app = initializeApp(effectiveConfig);
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
    await this.readyPromise;
    if (!this.auth || !this.googleProvider) {
      throw new Error('Authentication service is initializing. Please try again.');
    }
    const credential = await signInWithPopup(this.auth, this.googleProvider);
    return credential.user;
  }

  async loginWithEmail(email, password) {
    await this.readyPromise;
    if (!this.auth) {
      throw new Error('Authentication service is unavailable.');
    }
    const credential = await signInWithEmailAndPassword(this.auth, email.trim(), password);
    return credential.user;
  }

  async registerWithEmail(email, password, fullName) {
    await this.readyPromise;
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
    await this.readyPromise;
    if (!this.auth) {
      throw new Error('Authentication service is unavailable.');
    }
    return await sendPasswordResetEmail(this.auth, email.trim());
  }

  async resendVerificationEmail() {
    await this.readyPromise;
    if (!this.auth?.currentUser) {
      throw new Error('No signed-in user found to resend verification.');
    }
    return await sendEmailVerification(this.auth.currentUser);
  }

  async refreshIdentity() {
    await this.readyPromise;
    const user = this.auth?.currentUser;
    if (!user) throw new Error('Sign in to refresh your verification status.');
    await reload(user);
    await user.getIdToken(true);
    const { data } = await api.post('/auth/bootstrap', {});
    if (this.auth.currentUser !== user) return;
    this.appUserContext = data;
    this._notify();
    return data;
  }

  async logout() {
    await this.readyPromise;
    if (!this.auth) return;
    const context = this.getContext();
    const attendanceApplies = context.status === 'ACTIVE' && context.roles.length === 1 && context.roles[0] === 'INTERN';
    await signOutWithAttendance({
      checkOut: attendanceApplies && this.auth.currentUser
        ? () => api.post('/attendance/check-out', {}, { timeoutMs: 3000 }) : undefined,
      signOut: () => signOut(this.auth),
      notify: (notice) => {
        window.dispatchEvent(new CustomEvent('intelliCoreAttendanceNotice', { detail: notice }));
        try {
          sessionStorage.setItem('intelliCoreAttendanceNotice', notice);
        } catch {
          // The dashboard can still display the notice.
        }
      }
    });
    this.currentUser = null;
    this.appUserContext = null;
    this._notify();
  }

  determineDashboardRoute(context = this.getContext()) {
    if (!context.isAuthenticated) return null;

    const { workspaces, status, roles = [] } = context;
    if (workspaces?.onboarding) return '/dashboards/intern';
    if (!context.appUser?.emailVerified || status !== 'ACTIVE') return '/?auth=login';

    if (roles.includes('FOUNDER')) {
      return '/dashboards/founder';
    }
    if (roles.includes('CO_FOUNDER')) {
      return '/dashboards/co-founder';
    }
    if (roles.includes('ADMIN')) {
      return '/dashboards/admin';
    }
    if (roles.includes('HR_MANAGER')) {
      return '/dashboards/hr';
    }
    if (roles.includes('HR_EXECUTIVE')) {
      return '/dashboards/hr-executive';
    }
    if (roles.includes('OPERATIONS_EXECUTIVE')) {
      return '/dashboards/operations';
    }
    if (roles.includes('TEAM_LEADER') || workspaces.teamLeader) {
      return '/dashboards/team-leader';
    }
    if (roles.includes('INTERN') || workspaces.intern) {
      return '/dashboards/intern';
    }
    if (workspaces.founder) return '/dashboards/founder';
    if (workspaces.hr) return '/dashboards/hr';

    return '/';
  }
}

export const authService = new AuthService();
export default authService;
