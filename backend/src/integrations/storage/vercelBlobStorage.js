import { Readable } from 'node:stream';
import { del, get, put } from '@vercel/blob';
import { AppError, NotFoundError } from '../../utils/errors.js';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const unavailable = () => new AppError('Private storage is temporarily unavailable.', 503, 'STORAGE_UNAVAILABLE');

export class VercelBlobStorage {
  constructor({ token = process.env.BLOB_READ_WRITE_TOKEN, client = { del, get, put } } = {}) {
    this.token = token;
    this.client = client;
  }

  pathname(key) {
    if (!uuid.test(key)) throw new AppError('Invalid private attachment identifier.', 400, 'INVALID_STORAGE_KEY');
    if (!this.token) throw unavailable();
    return 'phase06/' + key;
  }

  async savePrivate(key, bytes) {
    const pathname = this.pathname(key);
    try {
      await this.client.put(pathname, bytes, { token: this.token, access: 'private', addRandomSuffix: false,
        allowOverwrite: false, contentType: 'application/octet-stream' });
    } catch { throw unavailable(); }
  }

  async openPrivate(key) {
    const pathname = this.pathname(key);
    let result;
    try {
      result = await this.client.get(pathname, { token: this.token, access: 'private', useCache: false });
    } catch { throw unavailable(); }
    if (!result) throw new NotFoundError('Attachment unavailable.');
    if (result.statusCode !== 200 || !result.stream) throw unavailable();
    return Readable.fromWeb(result.stream);
  }

  async removePrivate(key) {
    const pathname = this.pathname(key);
    try { await this.client.del(pathname, { token: this.token }); }
    catch { throw unavailable(); }
  }
}
