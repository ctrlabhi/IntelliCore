import { z } from 'zod';
import dotenv from 'dotenv';
import { resolveDatabaseConfiguration, sanitizeDatabaseUrl } from './databaseUrl.js';

// Load .env if present (skip in test runner unless explicitly needed)
if (process.env.NODE_ENV !== 'test' && process.env.VERCEL !== '1') {
  dotenv.config();
}

// Pre-resolve and validate database configuration
let resolvedDb;
try {
  resolvedDb = resolveDatabaseConfiguration(process.env);
  process.env.DATABASE_URL = resolvedDb.databaseUrl;
} catch (err) {
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL !== '1') {
    throw err;
  }
  if (process.env.VERCEL === '1') {
    console.error('⚠️ [Vercel Environment Warning]:', err.message);
  }
  // In development, test, or unconfigured Vercel cold-start fallback
  resolvedDb = {
    databaseUrl: process.env.DATABASE_URL || '',
    migrationDatabaseUrl: process.env.MIGRATION_DATABASE_URL || null,
    notificationDatabaseUrl: process.env.NOTIFICATION_DATABASE_URL || null
  };
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  UPLOAD_DIR: z.string().default('./backend/uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(25),
  TASK_MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(10).catch(5),
  TASK_MAX_ATTACHMENTS: z.coerce.number().int().min(1).max(20).catch(5),

  // Database Connection (Individual + Connection URL)
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().optional().default(3306),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_SSL: z.coerce.string().optional(),

  // Legacy & Compatibility Fields
  MYSQL_DATABASE: z.string().default(process.env.DB_NAME || 'intellicore_db'),
  MYSQL_USER: z.string().default(process.env.DB_USER || 'intellicore_app'),
  MYSQL_PASSWORD: z.string().default(process.env.DB_PASSWORD || 'intellicore_dev_pass'),
  MYSQL_ROOT_PASSWORD: z.string().default('intellicore_root_pass'),
  DATABASE_URL: z.string().default(resolvedDb.databaseUrl),
  MIGRATION_DATABASE_URL: z.string().optional(),
  NOTIFICATION_DATABASE_URL: z.string().optional(),

  // Storage
  STORAGE_PROVIDER: z.enum(['local', 'vercel-blob', 's3']).default('local'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // Background Worker & Vercel Cron
  CRON_SECRET: z.string().optional(),
  NOTIFICATION_CRON_ENABLED: z.string().optional().default('false'),
  EMAIL_DELIVERY_MODE: z.enum(['CAPTURE', 'DISABLED', 'SMTP']).default('CAPTURE'),

  // Rate Limiting & Security
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Firebase Authentication
  FIREBASE_PROJECT_ID: z.string().default('intellicore-dev'),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  FOUNDER_EMAIL: z.string().email().optional(),
  FOUNDER_FIREBASE_UID: z.string().optional()
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsedEnv.error.format());
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Invalid environment configuration in production.');
  }
}

export const env = parsedEnv.success ? parsedEnv.data : envSchema.parse({ DATABASE_URL: resolvedDb.databaseUrl });
export { sanitizeDatabaseUrl };
export default env;
