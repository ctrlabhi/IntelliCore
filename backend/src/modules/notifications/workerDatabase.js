import { vercelDatabaseUrl } from '../../config/vercelDatabase.js';

export function workerDatabaseUrl(source = process.env) {
  try {
    const rawWorkerUrl = source.NOTIFICATION_DATABASE_URL;
    if (!rawWorkerUrl && source.ALLOW_SHARED_WORKER_DB === 'true' && source.DATABASE_URL) {
      return vercelDatabaseUrl(source.DATABASE_URL, { worker: true, local: source.VERCEL_ENV === 'development' });
    }
    const url = new URL(rawWorkerUrl);
    const runtime = source.DATABASE_URL && new URL(source.DATABASE_URL);
    const account = decodeURIComponent(url.username);
    const runtimeAccount = runtime && decodeURIComponent(runtime.username);
    const isWorkerAccount = /(?:^intellicore_worker|^[a-z0-9]+_worker)(?:_[a-z0-9]+)?$/i.test(account);
    if (url.protocol !== 'mysql:' || !url.password || !url.host || !isWorkerAccount
      || account.toLowerCase() === runtimeAccount?.toLowerCase() || !/^\/[a-z0-9_]+$/i.test(url.pathname)) throw new Error();
    if (source.VERCEL !== '1') return url.href;
    if (!runtime || runtime.hostname !== url.hostname || runtime.port !== url.port || runtime.pathname !== url.pathname) throw new Error();
    return vercelDatabaseUrl(url.href, { worker: true, local: source.VERCEL_ENV === 'development' });
  } catch {
    throw new Error('A dedicated intellicore_worker MySQL account is required.');
  }
}
