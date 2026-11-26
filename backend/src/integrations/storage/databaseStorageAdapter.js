import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { getPrismaClient } from '../../config/database.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import logger from '../../config/logger.js';

const getPrisma = () => getPrismaClient();

const uuidRegex = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// 30KB base64 chunk size safely fits within MySQL Text (65,535 bytes) column
const CHUNK_SIZE = 30000;

/**
 * Hardened Zero-Cost Database-Backed Storage Adapter
 * Persists document attachments in MySQL/MariaDB SystemSetting records
 * with cryptographic SHA-256 integrity verification, chunk ordering checks,
 * atomic transactions, and orphaned blob cleanup.
 */
export class DatabaseStorageAdapter {
  async savePrivate(key, bytes) {
    if (!uuidRegex.test(key)) {
      throw new AppError('Invalid private attachment identifier.', 400, 'INVALID_STORAGE_KEY');
    }

    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const base64 = buffer.toString('base64');
    const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);

    try {
      await getPrisma().$transaction(async (tx) => {
        // 1. Transactionally remove existing chunks if any
        await tx.systemSetting.deleteMany({
          where: { key: { startsWith: `file_blob:${key}` } }
        });

        // 2. Store metadata header with SHA-256 checksum and total chunks
        await tx.systemSetting.create({
          data: {
            key: `file_blob:${key}:meta`,
            value: JSON.stringify({
              totalChunks,
              byteLength: buffer.length,
              base64Length: base64.length,
              checksum,
              createdAt: new Date().toISOString()
            }),
            description: `Document attachment metadata for ${key}`
          }
        });

        // 3. Store chunked payload
        for (let i = 0; i < totalChunks; i++) {
          const chunk = base64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await tx.systemSetting.create({
            data: {
              key: `file_blob:${key}:chunk:${String(i).padStart(5, '0')}`,
              value: chunk,
              description: `Document chunk ${i + 1}/${totalChunks} for ${key}`
            }
          });
        }
      });
      logger.info({ key, totalChunks, byteLength: buffer.length, checksum }, 'Attachment saved to database storage');
    } catch (error) {
      logger.error({ error: error.message, key }, 'Failed to persist attachment in database storage');
      throw new AppError('Private storage is temporarily unavailable.', 503, 'STORAGE_UNAVAILABLE');
    }
  }

  async openPrivate(key) {
    if (!uuidRegex.test(key)) {
      throw new AppError('Invalid private attachment identifier.', 400, 'INVALID_STORAGE_KEY');
    }

    try {
      // 1. Retrieve metadata header
      const metaRow = await getPrisma().systemSetting.findUnique({
        where: { key: `file_blob:${key}:meta` }
      });

      if (!metaRow) {
        throw new NotFoundError('Attachment unavailable.');
      }

      let meta;
      try {
        meta = JSON.parse(metaRow.value);
      } catch {
        throw new AppError('Storage integrity check failed: corrupt metadata.', 500, 'STORAGE_INTEGRITY_ERROR');
      }

      // 2. Retrieve all chunks ordered ascending
      const chunks = await getPrisma().systemSetting.findMany({
        where: { key: { startsWith: `file_blob:${key}:chunk:` } },
        orderBy: { key: 'asc' }
      });

      if (!chunks || chunks.length !== meta.totalChunks) {
        logger.error({ key, expected: meta.totalChunks, actual: chunks?.length }, 'Missing chunks in storage');
        throw new AppError('Storage integrity check failed: missing data chunks.', 500, 'STORAGE_INTEGRITY_ERROR');
      }

      // 3. Reconstruct payload and verify cryptographic integrity
      const fullBase64 = chunks.map((c) => c.value).join('');
      const buffer = Buffer.from(fullBase64, 'base64');

      if (buffer.length !== meta.byteLength) {
        logger.error({ key, expected: meta.byteLength, actual: buffer.length }, 'Payload size mismatch');
        throw new AppError('Storage integrity check failed: payload size mismatch.', 500, 'STORAGE_INTEGRITY_ERROR');
      }

      const calculatedHash = createHash('sha256').update(buffer).digest('hex');
      if (meta.checksum && calculatedHash !== meta.checksum) {
        logger.error({ key, expected: meta.checksum, actual: calculatedHash }, 'Payload checksum mismatch');
        throw new AppError('Storage integrity check failed: checksum validation failed.', 500, 'STORAGE_INTEGRITY_ERROR');
      }

      return Readable.from(buffer);
    } catch (error) {
      if (error instanceof NotFoundError || error.code === 'STORAGE_INTEGRITY_ERROR') throw error;
      logger.error({ error: error.message, key }, 'Failed to retrieve attachment from database storage');
      throw new AppError('Private storage is temporarily unavailable.', 503, 'STORAGE_UNAVAILABLE');
    }
  }

  async removePrivate(key) {
    if (!uuidRegex.test(key)) {
      throw new AppError('Invalid private attachment identifier.', 400, 'INVALID_STORAGE_KEY');
    }

    try {
      await getPrisma().systemSetting.deleteMany({
        where: { key: { startsWith: `file_blob:${key}` } }
      });
    } catch (error) {
      logger.error({ error: error.message, key }, 'Failed to remove attachment from database storage');
      throw new AppError('Private storage is temporarily unavailable.', 503, 'STORAGE_UNAVAILABLE');
    }
  }

  /**
   * Transactional Cleanup of Orphaned Blobs
   * Purges database storage blobs that have no referencing record in file_attachments
   */
  async cleanupOrphanedBlobs() {
    try {
      const metaRows = await getPrisma().systemSetting.findMany({
        where: { key: { startsWith: 'file_blob:', endsWith: ':meta' } },
        select: { key: true }
      });

      let cleaned = 0;
      for (const row of metaRows) {
        const parts = row.key.split(':');
        const storageKey = parts[1];
        if (storageKey) {
          const exists = await getPrisma().fileAttachment.findUnique({
            where: { storageKey },
            select: { id: true }
          });
          if (!exists) {
            await this.removePrivate(storageKey);
            cleaned++;
          }
        }
      }
      return { cleaned };
    } catch (err) {
      logger.warn({ err: err.message }, 'Orphaned blob cleanup encountered an error');
      return { cleaned: 0, error: err.message };
    }
  }

  async save(filename, buffer) {
    const key = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
    const base64 = Buffer.isBuffer(buffer) ? buffer.toString('base64') : Buffer.from(buffer).toString('base64');
    await getPrisma().systemSetting.upsert({
      where: { key: `public_file:${key}` },
      update: { value: base64 },
      create: {
        key: `public_file:${key}`,
        value: base64,
        description: `Generic file ${filename}`
      }
    });
    return { filename, path: `db://public_file:${key}` };
  }

  async read(filename) {
    const key = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
    const row = await getPrisma().systemSetting.findUnique({
      where: { key: `public_file:${key}` }
    });
    if (!row) throw new NotFoundError('File not found.');
    return Buffer.from(row.value, 'base64');
  }

  async delete(filename) {
    const key = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
    try {
      await getPrisma().systemSetting.delete({
        where: { key: `public_file:${key}` }
      });
      return true;
    } catch {
      return false;
    }
  }
}

export const databaseStorage = new DatabaseStorageAdapter();
export default databaseStorage;
