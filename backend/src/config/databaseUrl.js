import fs from 'node:fs';

/**
 * Database URL Construction & Validation Module
 * Supports individual environment variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL)
 * and full connection URLs (DATABASE_URL, MIGRATION_DATABASE_URL, NOTIFICATION_DATABASE_URL).
 * Ensures correct URL-encoding, conflict detection, strict TLS verification, and credential sanitization.
 */

/**
 * URL-encode database credentials and construct a Prisma-compatible MySQL connection URL.
 *
 * @param {Object} options
 * @param {string} options.host - Database host (e.g. Hostinger hostname or IP)
 * @param {number|string} [options.port=3306] - Database port
 * @param {string} options.database - Database name
 * @param {string} options.user - Database username
 * @param {string} options.password - Database password
 * @param {boolean|string} [options.ssl=true] - Whether SSL is required
 * @param {number} [options.connectionLimit] - Max pool connection limit
 * @param {number} [options.poolTimeout] - Connection pool timeout in seconds
 * @param {number} [options.connectTimeout] - Connect timeout in seconds
 * @returns {string} The constructed Prisma connection URL
 */
export function buildDatabaseUrl({
  host,
  port = 3306,
  database,
  user,
  password,
  ssl = true,
  connectionLimit,
  poolTimeout,
  connectTimeout
} = {}) {
  if (!host || typeof host !== 'string' || !host.trim()) {
    throw new Error('DB_HOST is required to build database URL.');
  }
  if (!database || typeof database !== 'string' || !database.trim()) {
    throw new Error('DB_NAME is required to build database URL.');
  }
  if (!user || typeof user !== 'string' || !user.trim()) {
    throw new Error('DB_USER is required to build database URL.');
  }
  if (password === undefined || password === null) {
    throw new Error('DB_PASSWORD is required to build database URL.');
  }

  const trimmedHost = host.trim();
  const trimmedDb = database.trim();
  const trimmedUser = user.trim();
  const trimmedPass = String(password);
  const parsedPort = Number(port) || 3306;

  const encodedUser = encodeURIComponent(trimmedUser);
  const encodedPass = encodeURIComponent(trimmedPass);
  const encodedDb = encodeURIComponent(trimmedDb);

  const url = new URL(`mysql://${encodedUser}:${encodedPass}@${trimmedHost}:${parsedPort}/${encodedDb}`);

  const useSsl = ssl === true || ssl === 'true' || ssl === '1';
  if (useSsl) {
    url.searchParams.set('sslaccept', 'strict');
  }

  if (connectionLimit) {
    url.searchParams.set('connection_limit', String(connectionLimit));
  }
  if (poolTimeout) {
    url.searchParams.set('pool_timeout', String(poolTimeout));
  }
  if (connectTimeout) {
    url.searchParams.set('connect_timeout', String(connectTimeout));
  }

  return url.href;
}

/**
 * Sanitizes a database connection URL by masking passwords.
 * Safe for logging and diagnostic output.
 *
 * @param {string} urlStr
 * @returns {string} Sanitized URL or placeholder
 */
export function sanitizeDatabaseUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return '';
  try {
    const url = new URL(urlStr);
    if (url.password) {
      url.password = '****';
    }
    return url.href;
  } catch {
    return '[INVALID_DATABASE_URL]';
  }
}

/**
 * Resolves effective database configuration from environment variables.
 * Handles:
 * - Direct DATABASE_URL resolution
 * - Constructing DATABASE_URL from individual DB_* variables
 * - Conflict detection between DATABASE_URL and DB_* variables
 * - Incomplete configuration detection
 * - Refusal of localhost fallback in production
 * - Enforcing verified TLS (blocking accept_invalid_certs)
 *
 * @param {Object} [envSource=process.env]
 * @returns {{ databaseUrl: string, migrationDatabaseUrl: string|null, notificationDatabaseUrl: string|null }}
 */
export function resolveDatabaseConfiguration(envSource = process.env) {
  const isProduction = envSource.NODE_ENV === 'production' || envSource.VERCEL === '1';
  const rawUrl = envSource.DATABASE_URL?.trim();

  const rawHost = envSource.DB_HOST?.trim();
  const rawPort = envSource.DB_PORT;
  const rawName = envSource.DB_NAME?.trim();
  const rawUser = envSource.DB_USER?.trim();
  const rawPass = envSource.DB_PASSWORD;

  const hasHost = Boolean(rawHost);
  const hasName = Boolean(rawName);
  const hasUser = Boolean(rawUser);
  const hasPassword = rawPass !== undefined && rawPass !== null && rawPass !== '';

  const hasAnyIndividual = hasHost || hasName || hasUser || hasPassword;

  // 1. Conflict detection if both DATABASE_URL and individual variables are provided
  if (rawUrl && hasAnyIndividual) {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('DATABASE_URL is not a valid URL.');
    }

    if (hasHost && parsed.hostname.toLowerCase() !== rawHost.toLowerCase()) {
      throw new Error(
        `Conflicting database configuration: DATABASE_URL host (${parsed.hostname}) does not match DB_HOST (${rawHost}).`
      );
    }
    if (hasName) {
      const parsedDb = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
      if (parsedDb.toLowerCase() !== rawName.toLowerCase()) {
        throw new Error(
          `Conflicting database configuration: DATABASE_URL database (${parsedDb}) does not match DB_NAME (${rawName}).`
        );
      }
    }
    if (hasUser) {
      const parsedUser = decodeURIComponent(parsed.username);
      if (parsedUser.toLowerCase() !== rawUser.toLowerCase()) {
        throw new Error(
          `Conflicting database configuration: DATABASE_URL user (${parsedUser}) does not match DB_USER (${rawUser}).`
        );
      }
    }
  }

  let finalUrl;

  // 2. Resolve URL
  if (rawUrl) {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('DATABASE_URL is not a valid URL.');
    }
    if (parsed.protocol !== 'mysql:') {
      throw new Error('DATABASE_URL must use mysql: protocol.');
    }
    // Block insecure TLS bypass
    if (parsed.searchParams.get('sslaccept') === 'accept_invalid_certs') {
      throw new Error(
        'Insecure TLS configuration detected: sslaccept=accept_invalid_certs is forbidden. TLS certificate verification must not be disabled.'
      );
    }
    finalUrl = rawUrl;
  } else if (hasAnyIndividual) {
    // Check for missing individual parameters
    const missing = [];
    if (!hasHost) missing.push('DB_HOST');
    if (!hasName) missing.push('DB_NAME');
    if (!hasUser) missing.push('DB_USER');
    if (!hasPassword) missing.push('DB_PASSWORD');

    if (missing.length > 0) {
      throw new Error(`Incomplete database configuration: missing required variable(s): ${missing.join(', ')}.`);
    }

    const sslConfig = envSource.DB_SSL !== undefined ? envSource.DB_SSL : (isProduction ? 'true' : 'false');
    finalUrl = buildDatabaseUrl({
      host: rawHost,
      port: rawPort || 3306,
      database: rawName,
      user: rawUser,
      password: rawPass,
      ssl: sslConfig
    });
  } else {
    // Neither provided
    if (isProduction && envSource.NODE_ENV !== 'test') {
      throw new Error(
        'Database configuration missing in production. Provide DATABASE_URL or individual DB_HOST, DB_NAME, DB_USER, DB_PASSWORD variables.'
      );
    }
    // Development fallback
    finalUrl = 'mysql://intellicore_app:intellicore_dev_pass@localhost:3306/intellicore_db';
  }

  // 3. Prevent silent fallback to localhost in production
  if (isProduction && envSource.VERCEL_ENV !== 'development' && envSource.NODE_ENV !== 'test') {
    const parsed = new URL(finalUrl);
    if (
      ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname) ||
      parsed.hostname.endsWith('.localhost')
    ) {
      throw new Error(
        'Production database cannot connect to a localhost / loopback address. Configure remote database credentials.'
      );
    }
  }

  const normalizeLocalHost = (urlStr) => {
    if (!urlStr || isProduction) return urlStr;
    try {
      const u = new URL(urlStr);
      if (u.hostname.toLowerCase() === 'mysql' && !fs.existsSync('/.dockerenv')) {
        u.hostname = '127.0.0.1';
        return u.href;
      }
    } catch {}
    return urlStr;
  };

  const effectiveFinalUrl = normalizeLocalHost(finalUrl);

  return {
    databaseUrl: effectiveFinalUrl,
    migrationDatabaseUrl: normalizeLocalHost(envSource.MIGRATION_DATABASE_URL?.trim()) || null,
    notificationDatabaseUrl: normalizeLocalHost(envSource.NOTIFICATION_DATABASE_URL?.trim()) || null
  };
}

export default {
  buildDatabaseUrl,
  sanitizeDatabaseUrl,
  resolveDatabaseConfiguration
};
