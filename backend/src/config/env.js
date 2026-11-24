import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env if present
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  UPLOAD_DIR: z.string().default('./backend/uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(25),

  // Database
  MYSQL_DATABASE: z.string().default('intellicore_db'),
  MYSQL_USER: z.string().default('intellicore_app'),
  MYSQL_PASSWORD: z.string().default('intellicore_dev_pass'),
  MYSQL_ROOT_PASSWORD: z.string().default('intellicore_root_pass'),
  DATABASE_URL: z.string().default('mysql://intellicore_app:intellicore_dev_pass@localhost:3306/intellicore_db'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  CORS_ORIGIN: z.string().default('http://localhost:3000')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsedEnv.error.format());
  // In development, provide helpful fallback warning
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Invalid environment configuration in production.');
  }
}

export const env = parsedEnv.success ? parsedEnv.data : envSchema.parse({});
export default env;

