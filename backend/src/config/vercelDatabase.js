export function vercelDatabaseUrl(value, { limit = 2, local = false, worker = false } = {}) {
  try {
    const url = new URL(value);
    const account = decodeURIComponent(url.username).toLowerCase();
    if (url.protocol !== 'mysql:' || !account || !url.password || url.pathname.length < 2 || url.hash
      || /^(?:root$|intellicore_migration(?:_|$))/u.test(account)
      || (!worker && /^intellicore_worker(?:_|$)/u.test(account))) throw new Error();
    if (!local) {
      if (!url.hostname.includes('.') || ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)
        || url.hostname.endsWith('.localhost')) throw new Error();
      url.searchParams.set('sslaccept', 'strict');
    }
    const configured = Number(url.searchParams.get('connection_limit'));
    url.searchParams.set('connection_limit', String(Number.isInteger(configured) && configured > 0
      ? Math.min(configured, limit) : limit));
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '5');
    if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '5');
    return url.href;
  } catch {
    throw new Error('Configure a dedicated MySQL connection for the Vercel environment.');
  }
}
