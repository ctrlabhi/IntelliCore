import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'node:url';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { VercelBlobStorage } from './vercelBlobStorage.js';
import { AppError, NotFoundError } from '../../utils/errors.js';

const frontendDirectory = fileURLToPath(new URL('../../../../frontend', import.meta.url));

function insideDirectory(root, directory) {
  const relative = path.relative(root, directory);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}

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

  async privatePath(key, createDirectory = false) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(key)) {
      throw new AppError('Invalid private attachment identifier.', 400, 'INVALID_STORAGE_KEY');
    }
    const directory = path.join(this.baseDir, 'phase06');
    if (insideDirectory(frontendDirectory, directory)) throw new Error('Unavailable private storage directory.');
    if (createDirectory) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const metadata = await fs.lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Unavailable private storage directory.');
    const [actualFrontend, actualStorage] = await Promise.all([fs.realpath(frontendDirectory), fs.realpath(directory)]);
    if (insideDirectory(actualFrontend, actualStorage)) throw new Error('Unavailable private storage directory.');
    return path.join(actualStorage, key);
  }

  async savePrivate(key, bytes) {
    let handle;
    let filePath;
    try {
      filePath = await this.privatePath(key, true);
      handle = await fs.open(filePath, 'wx', 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
    } catch {
      if (handle) {
        await handle.close().catch(() => {});
        await fs.unlink(filePath).catch(() => {});
      }
      throw new AppError('Private storage is temporarily unavailable.', 503, 'STORAGE_UNAVAILABLE');
    }
  }

  async openPrivate(key) {
    try {
      const filePath = await this.privatePath(key);
      const metadata = await fs.lstat(filePath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new NotFoundError('Attachment unavailable.');
      const handle = await fs.open(filePath, 'r');
      return handle.createReadStream();
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof NotFoundError) throw new NotFoundError('Attachment unavailable.');
      throw new AppError('Private storage is temporarily unavailable.', 503, 'STORAGE_UNAVAILABLE');
    }
  }

  async removePrivate(key) {
    try {
      await fs.unlink(await this.privatePath(key));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new AppError('Private storage is temporarily unavailable.', 503, 'STORAGE_UNAVAILABLE');
    }
  }
}

import databaseStorage from './databaseStorageAdapter.js';

export const storageService =
  env.STORAGE_PROVIDER === 'database'
    ? databaseStorage
    : env.STORAGE_PROVIDER === 'vercel-blob' || process.env.VERCEL === '1'
      ? new VercelBlobStorage()
      : new StorageService();
export default storageService;

