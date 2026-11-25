import { vercelDatabaseUrl } from '../../config/vercelDatabase.js';

export function workerDatabaseUrl(source = process.env) {
  try {
    const url = new URL(source.NOTIFICATION_DATABASE_URL);
    const runtime = source.DATABASE_URL && new URL(source.DATABASE_URL);
    const account = decodeURIComponent(url.username);
    const runtimeAccount = runtime && decodeURIComponent(runtime.username);
    if (url.protocol !== 'mysql:' || !url.password || !url.host || !/^intellicore_worker(?:_[a-z0-9]+)?$/i.test(account)
      || account.toLowerCase() === runtimeAccount?.toLowerCase() || !/^\/[a-z0-9_]+$/i.test(url.pathname)) throw new Error();
    if (source.VERCEL !== '1') return url.href;
    if (!runtime || runtime.hostname !== url.hostname || runtime.port !== url.port || runtime.pathname !== url.pathname) throw new Error();
    return vercelDatabaseUrl(url.href, { worker: true, local: source.VERCEL_ENV === 'development' });
  } catch {
    throw new Error('A dedicated intellicore_worker MySQL account is required.');
  }
}
