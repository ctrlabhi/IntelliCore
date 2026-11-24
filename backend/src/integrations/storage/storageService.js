import fs from 'fs/promises';
import path from 'path';
import env from '../../config/env.js';
import logger from '../../config/logger.js';

/**
 * File Storage Abstraction
 * Supports persistent local storage (Docker volume) in Phase 1
 * and prepares interface for future S3/GCS cloud providers.
 */
export class StorageService {
  constructor(baseDir = env.UPLOAD_DIR) {
    this.baseDir = path.resolve(baseDir);
  }

  async init() {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      logger.info({ path: this.baseDir }, 'Storage directory initialized');
    } catch (err) {
      logger.error({ err: err.message, path: this.baseDir }, 'Failed to create storage directory');
    }
  }

  async save(filename, buffer) {
    await this.init();
    const filePath = path.join(this.baseDir, filename);
    await fs.writeFile(filePath, buffer);
    return { filename, path: filePath };
  }

  async read(filename) {
    const filePath = path.join(this.baseDir, filename);
    return fs.readFile(filePath);
  }

  async delete(filename) {
    const filePath = path.join(this.baseDir, filename);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }
}

export const storageService = new StorageService();
export default storageService;

