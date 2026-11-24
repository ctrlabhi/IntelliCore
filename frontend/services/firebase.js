/**
 * IntelliCore Firebase Integration Abstraction
 * Version: 2.0.0
 * 
 * In Phase 1 Local Development, legacy production Firebase is quarantined.
 * This module isolates client calls and prevents accidental production mutations.
 */

/**
 * IntelliCore Firebase Integration Abstraction
 * Version: 2.0.0
 * Environment: Local Development
 * 
 * Configured for isolated development Firebase project (intellicore-dev).
 * Production Firebase (intellicore-229) is quarantined.
 */

export const firebaseConfig = {
  isConfigured: true,
  apiKey: 'AIzaSyDOQq-_c84R3W3QbMDeCD0PsRXZL5pq2oc',
  authDomain: 'intellicore-dev.firebaseapp.com',
  projectId: 'intellicore-dev',
  storageBucket: 'intellicore-dev.firebasestorage.app',
  messagingSenderId: '287532496050',
  appId: '1:287532496050:web:015491f32a089ce1d585ab',
  environment: 'development'
};

export function getDevFirebase() {
  return firebaseConfig;
}

export default {
  firebaseConfig,
  getDevFirebase
};


