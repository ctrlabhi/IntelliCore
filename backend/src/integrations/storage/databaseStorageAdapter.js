import { Readable } from 'node:stream';
import prisma from '../../config/database.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import logger from '../../config/logger.js';

const uuidRegex = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// 30KB base64 chunk size safely fits within MySQL Text (65,535 bytes) column
const CHUNK_SIZE = 30000;

/**
 * Zero-Cost Database-Backed Storage Adapter
 * Persists document attachments in MySQL/MariaDB SystemSetting records
 * without requiring any schema migrations, external blob storage, or paid S3.
 */
export class DatabaseStorageAdapter {
  async savePrivate(key, bytes) {
    if (!uuidRegex.test(key)) {
      throw new AppError('Invalid private attachment identifier.', 400, 'INVALID_STORAGE_KEY');
    }

    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);

    try {
      await prisma.$transaction(async (tx) => {
        // Remove existing chunks if any
        await tx.systemSetting.deleteMany({
          where: { key: { startsWith: `file_blob:${key}` } }
        });

        // Store metadata header
        await tx.systemSetting.create({
          data: {
            key: `file_blob:${key}:meta`,
            value: JSON.stringify({
              totalChunks,
              byteLength: buffer.length,
              base64Length: base64.length,
              createdAt: new Date().toISOString()
            }),
            description: `Document attachment metadata for ${key}`
          }
        });

        // Store chunked payload
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
      logger.info({ key, totalChunks, byteLength: buffer.length }, 'Attachment saved to database storage');
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
      const chunks = await prisma.systemSetting.findMany({
        where: { key: { startsWith: `file_blob:${key}:chunk:` } },
        orderBy: { key: 'asc' }
      });

      if (!chunks || chunks.length === 0) {
        throw new NotFoundError('Attachment unavailable.');
      }

      const fullBase64 = chunks.map((c) => c.value).join('');
      const buffer = Buffer.from(fullBase64, 'base64');
      return Readable.from(buffer);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error({ error: error.message, key }, 'Failed to retrieve attachment from database storage');
      throw new AppError('Private storage is temporarily unavailable.', 503, 'STORAGE_UNAVAILABLE');
    }
  }

  async removePrivate(key) {
    if (!uuidRegex.test(key)) {
      throw new AppError('Invalid private attachment identifier.', 400, 'INVALID_STORAGE_KEY');
    }

    try {
      await prisma.systemSetting.deleteMany({
        where: { key: { startsWith: `file_blob:${key}` } }
      });
    } catch (error) {
      logger.error({ error: error.message, key }, 'Failed to remove attachment from database storage');
      throw new AppError('Private storage is temporarily unavailable.', 503, 'STORAGE_UNAVAILABLE');
    }
  }

  async save(filename, buffer) {
    const key = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
    const base64 = Buffer.isBuffer(buffer) ? buffer.toString('base64') : Buffer.from(buffer).toString('base64');
    await prisma.systemSetting.upsert({
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
    const row = await prisma.systemSetting.findUnique({
      where: { key: `public_file:${key}` }
    });
    if (!row) throw new NotFoundError('File not found.');
    return Buffer.from(row.value, 'base64');
  }

  async delete(filename) {
    const key = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
    try {
      await prisma.systemSetting.delete({
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
