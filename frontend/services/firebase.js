/**
 * IntelliCore Firebase Integration Abstraction
 * Version: 2.0.0
 * 
 * Supports both local development (intellicore-dev) and production runtime configuration.
 * Never exposes private service account keys or administrative secrets.
 */

const runtimeConfig = (typeof window !== 'undefined' && window.__INTELLICORE_FIREBASE_CONFIG__) || null;

export const firebaseConfig = runtimeConfig || {
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
