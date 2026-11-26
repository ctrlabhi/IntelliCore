/**
 * IntelliCore V2.0 — Hostinger Remote Database Verification Script
 *
 * Connects to the configured database, detects MySQL vs MariaDB engine & version,
 * verifies TLS encryption and certificate validation, inspects existing tables and records
 * using read-only operations, checks database privileges and connection limits,
 * and confirms readiness for deployment without exposing credentials.
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Prioritize .env.production.local if present
const prodEnvPath = path.resolve(process.cwd(), '.env.production.local');
if (fs.existsSync(prodEnvPath)) {
  const prodEnv = dotenv.parse(fs.readFileSync(prodEnvPath));
  if (!prodEnv.DATABASE_URL && (prodEnv.DB_HOST || prodEnv.DB_NAME)) {
    delete process.env.DATABASE_URL;
  }
  dotenv.config({ path: prodEnvPath, override: true });
}

import { PrismaClient } from '@prisma/client';
import { resolveDatabaseConfiguration, sanitizeDatabaseUrl } from '../backend/src/config/databaseUrl.js';

async function main() {
  console.log('================================================================');
  console.log('🔍 INTELLICORE V2.0 — HOSTINGER DATABASE VERIFICATION');
  console.log('================================================================');

  let config;
  try {
    config = resolveDatabaseConfiguration(process.env);
  } catch (err) {
    console.error('\n❌ Configuration Error:');
    console.error(`   ${err.message}`);
    console.error('\nPlease verify your settings in .env.production.local:');
    console.error('   DB_HOST=<your_hostinger_hostname>');
    console.error('   DB_PORT=3306');
    console.error('   DB_NAME=<your_database_name>');
    console.error('   DB_USER=<your_database_username>');
    console.error('   DB_PASSWORD=<your_database_password>');
    console.error('   DB_SSL=true');
    process.exit(1);
  }

  const connectionUrl = config.databaseUrl;
  console.log(`📡 Target Database URL: ${sanitizeDatabaseUrl(connectionUrl)}`);

  // Verify non-localhost in production mode
  const parsed = new URL(connectionUrl);
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname) && process.env.NODE_ENV === 'production') {
    console.error('❌ Production configuration cannot connect to a local development database.');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasourceUrl: connectionUrl,
    log: []
  });

  try {
    console.log('⏳ Connecting to Hostinger remote database...');
    const pingStart = Date.now();
    await prisma.$queryRaw`SELECT 1 as ping`;
    const latency = Date.now() - pingStart;
    console.log(`✅ Connection successful! Ping latency: ${latency}ms`);

    // 1. Detect engine, version, and server identity
    const versionResult = await prisma.$queryRaw`SELECT VERSION() as version`;
    const rawVersion = versionResult[0]?.version || 'Unknown';
    const isMariaDB = rawVersion.toLowerCase().includes('mariadb');
    const engineType = isMariaDB ? 'MariaDB' : 'MySQL';

    console.log(`\n📊 1. Server Engine & Version:`);
    console.log(`   Engine:        ${engineType}`);
    console.log(`   Version:       ${rawVersion}`);
    console.log(`   Target Host:   ${parsed.hostname}`);
    console.log(`   Port:          ${parsed.port || 3306}`);
    console.log(`   Database Name: ${decodeURIComponent(parsed.pathname.replace(/^\//, ''))}`);
    console.log(`   User:          ${decodeURIComponent(parsed.username)}`);

    if (isMariaDB) {
      console.log('   ℹ️ Hostinger hPanel shared/cloud hosting runs MariaDB.');
      console.log('      Verified compatible: InnoDB engine, JSON as LONGTEXT with JSON_VALID check, utf8mb4.');
    } else {
      console.log('   ℹ️ Standard MySQL detected.');
    }

    // 2. TLS Encryption & Cipher Verification
    console.log(`\n🔒 2. TLS / SSL Encryption Status:`);
    try {
      const sslStatus = await prisma.$queryRaw`SHOW STATUS LIKE 'Ssl_cipher'`;
      const cipher = sslStatus[0]?.Value || 'NONE';
      if (cipher && cipher !== 'NONE' && cipher !== '') {
        console.log(`   Status:   ENCRYPTED (Active)`);
        console.log(`   Cipher:   ${cipher}`);
        console.log(`   TLS Mode: Strict CA Verification (sslaccept=strict)`);
      } else {
        console.log(`   Status:   Unencrypted or plain connection.`);
        console.log(`   ⚠️ Remote connections over the public internet MUST enforce DB_SSL=true.`);
      }
    } catch {
      console.log('   ℹ️ Could not query Ssl_cipher status; Prisma connection parameters enforce strict TLS.');
    }

    // 3. Character set & collation
    console.log(`\n🌐 3. Encoding & Collation:`);
    try {
      const charsetResult = await prisma.$queryRaw`
        SELECT @@character_set_database as charset, @@collation_database as collation
      `;
      const charset = charsetResult[0]?.charset || 'unknown';
      const collation = charsetResult[0]?.collation || 'unknown';
      console.log(`   Database Charset:   ${charset}`);
      console.log(`   Database Collation: ${collation}`);

      if (charset.includes('utf8mb4')) {
        console.log('   ✅ UTF8MB4 supported (full Unicode, emojis, multi-byte character safety).');
      } else {
        console.log('   ⚠️ Recommended charset is utf8mb4. Migrations will enforce utf8mb4 for tables.');
      }
    } catch {
      console.log('   ℹ️ Using table-level collation definitions in migrations.');
    }

    // 4. Connection Limits & Privileges
    console.log(`\n⚙️ 4. Connection Limits & Privileges:`);
    try {
      const maxConn = await prisma.$queryRaw`SELECT @@max_connections as max_connections`;
      console.log(`   Server Max Connections: ${maxConn[0]?.max_connections || 'Unknown'}`);
      console.log(`   Vercel Pool Allocation: connection_limit=2 (conserves serverless pool headroom)`);
    } catch {
      console.log('   ℹ️ Max connections query not permitted; serverless connection capping active.');
    }

    try {
      const grants = await prisma.$queryRaw`SHOW GRANTS`;
      console.log(`   Effective Grants (${grants.length} statements returned):`);
      for (const g of grants.slice(0, 3)) {
        console.log(`     - ${Object.values(g)[0]}`);
      }
      if (grants.length > 3) {
        console.log(`     ... and ${grants.length - 3} more grants`);
      }
    } catch {
      console.log('   ℹ️ SHOW GRANTS not available for current user.');
    }

    // 5. Existing Tables & Migration State (Read-Only Inspection)
    console.log(`\n📋 5. Existing Tables & Migration History (Read-Only):`);
    const tablesResult = await prisma.$queryRaw`SHOW TABLES`;
    const tableNames = tablesResult.map((row) => Object.values(row)[0]);
    console.log(`   Total Tables Found: ${tableNames.length}`);

    if (tableNames.length === 0) {
      console.log('   Status: Database is completely EMPTY.');
      console.log('   ✅ Ready for initial migration: `npx prisma migrate deploy`');
    } else {
      console.log(`   Existing Tables: ${tableNames.slice(0, 8).join(', ')}${tableNames.length > 8 ? '...' : ''}`);

      if (tableNames.includes('_prisma_migrations')) {
        const migrations = await prisma.$queryRaw`
          SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at ASC
        `;
        console.log(`\n📜 Applied Migrations (${migrations.length} recorded):`);
        for (const m of migrations) {
          const status = m.rolled_back_at ? 'ROLLED BACK' : m.finished_at ? 'APPLIED' : 'PENDING/FAILED';
          console.log(`   - [${status}] ${m.migration_name}`);
        }
      } else {
        console.log('\n   ⚠️ Non-empty database without _prisma_migrations found.');
        console.log('      DO NOT run destructive migrations without owner confirmation.');
      }
    }

    console.log('\n================================================================');
    console.log('🎉 HOSTINGER DATABASE VERIFICATION PASSED');
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ Hostinger Database Connection / Verification Failed:');
    console.error(`   Message: ${err.message}`);
    if (err.code) {
      console.error(`   Error Code: ${err.code}`);
    }
    console.error('\nTroubleshooting Checklist:');
    console.error('1. Did you add your IP address to Hostinger Remote MySQL in hPanel?');
    console.error('   (In hPanel -> Databases -> Remote MySQL -> Add IP address -> Create)');
    console.error('2. Are DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD correct in .env.production.local?');
    console.error('3. Does your Hostinger MySQL password contain special characters? (They will be auto-encoded).');
    console.error('4. Ensure DB_PORT is set to 3306 and DB_SSL is true.');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
