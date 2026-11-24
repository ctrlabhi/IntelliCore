/**
 * IntelliCore Safe Development Authentication Service
 * Version: 2.0.0
 * 
 * Provides an explicit development-pending authentication state
 * while production Firebase is safely quarantined during Phase 1.
 */

import { api } from './api.js';

class AuthService {
  constructor() {
    this.user = null;
    this.listeners = new Set();
    this.isPhase1DevMode = true;
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChanged(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
      // Immediately notify with current state
      callback(this.user);
    }
    return () => this.listeners.delete(callback);
  }

  _notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.user);
      } catch (err) {
        console.error('[AuthService] Listener error:', err);
      }
    }
  }

  /**
   * Returns current authenticated user or null
   */
  getCurrentUser() {
    return this.user;
  }

  /**
   * Safe login placeholder
   */
  async login(email, password) {
    console.info('[AuthService] Login requested in Phase 1 Local Foundation mode.');
    return {
      status: 'pending_migration',
      message: 'Authentication module will be connected in Phase 2 with the development Firebase project.'
    };
  }

  /**
   * Safe Google login placeholder
   */
  async loginWithGoogle() {
    console.info('[AuthService] Google OAuth requested in Phase 1 Local Foundation mode.');
    return {
      status: 'pending_migration',
      message: 'Google Sign-In will be connected in Phase 2 with the development Firebase project.'
    };
  }

  /**
   * Safe logout
   */
  async logout() {
    this.user = null;
    this._notify();
    return { success: true };
  }
}

export const authService = new AuthService();
export default authService;

