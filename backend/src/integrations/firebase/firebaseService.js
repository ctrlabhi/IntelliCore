import logger from '../../config/logger.js';

/**
 * Isolated Firebase Service Abstraction
 * Quarantines legacy production Firebase during Phase 1.
 * Ready for development Firebase integration in Phase 2.
 */
export class FirebaseService {
  constructor() {
    this.isInitialized = false;
  }

  async verifyIdToken(idToken) {
    logger.warn('FirebaseService.verifyIdToken invoked in Phase 1 Development mode (No production calls allowed).');
    throw new Error('Authentication is in Phase 1 Development-Pending state.');
  }
}

export const firebaseService = new FirebaseService();
export default firebaseService;

