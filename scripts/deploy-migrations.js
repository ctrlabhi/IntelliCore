/**
 * IntelliCore V2.0 — Production Migration Deployment Runner
 *
 * Loads .env.production.local (or .env), resolves and constructs the Prisma DATABASE_URL
 * from individual variables (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL),
 * enforces strict TLS, and executes `prisma migrate deploy`.
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { resolveDatabaseConfiguration, sanitizeDatabaseUrl } from '../backend/src/config/databaseUrl.js';

// Prioritize .env.production.local if present
const prodEnvPath = path.resolve(process.cwd(), '.env.production.local');
if (fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath, override: true });
}

let config;
try {
  config = resolveDatabaseConfiguration(process.env);
} catch (err) {
  console.error('❌ Configuration error: ' + err.message);
  process.exit(1);
}

process.env.DATABASE_URL = config.databaseUrl;
console.log(`📡 Applying 11 version-controlled migrations to: ${sanitizeDatabaseUrl(config.databaseUrl)}`);

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: process.env,
  shell: true
});

process.exit(result.status ?? 1);
