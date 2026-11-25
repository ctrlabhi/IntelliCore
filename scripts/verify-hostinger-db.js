/**
 * IntelliCore V2.0 — Hostinger Remote Database Verification Script
 *
 * Connects to the configured database, detects MySQL vs MariaDB engine & version,
 * verifies character set and collation, inspects existing tables and migrations,
 * and confirms readiness for deployment without exposing credentials.
 */

import { PrismaClient } from '@prisma/client';
import { sanitizeDatabaseUrl } from '../backend/src/config/databaseUrl.js';
import env from '../backend/src/config/env.js';

async function main() {
  console.log('================================================================');
  console.log('🔍 INTELLICORE V2.0 — HOSTINGER DATABASE VERIFICATION');
  console.log('================================================================');

  const connectionUrl = process.env.DATABASE_URL || env.DATABASE_URL;
  console.log(`📡 Target Database URL: ${sanitizeDatabaseUrl(connectionUrl)}`);

  if (!connectionUrl) {
    console.error('❌ No database connection configured. Set DATABASE_URL or DB_HOST, DB_NAME, DB_USER, DB_PASSWORD in .env');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasourceUrl: connectionUrl,
    log: []
  });

  try {
    console.log('⏳ Connecting to database...');
    const pingStart = Date.now();
    await prisma.$queryRaw`SELECT 1 as ping`;
    const latency = Date.now() - pingStart;
    console.log(`✅ Connection successful! Latency: ${latency}ms`);

    // 1. Detect engine and version
    const versionResult = await prisma.$queryRaw`SELECT VERSION() as version`;
    const rawVersion = versionResult[0]?.version || 'Unknown';
    const isMariaDB = rawVersion.toLowerCase().includes('mariadb');
    const engineType = isMariaDB ? 'MariaDB' : 'MySQL';

    console.log(`\n📊 Database Engine Analysis:`);
    console.log(`   Engine:  ${engineType}`);
    console.log(`   Version: ${rawVersion}`);

    if (isMariaDB) {
      console.log('   ℹ️ Note: Hostinger hPanel shared/cloud hosting runs MariaDB.');
      console.log('      Compatible with Prisma MySQL provider, InnoDB storage, JSON as LONGTEXT.');
    } else {
      console.log('   ℹ️ MySQL detected. Standard Prisma MySQL 8.x target.');
    }

    // 2. Check collation and character set
    try {
      const charsetResult = await prisma.$queryRaw`
        SELECT @@character_set_database as charset, @@collation_database as collation
      `;
      const charset = charsetResult[0]?.charset || 'unknown';
      const collation = charsetResult[0]?.collation || 'unknown';
      console.log(`   Charset: ${charset}`);
      console.log(`   Collation: ${collation}`);

      if (charset.includes('utf8mb4')) {
        console.log('   ✅ UTF8MB4 supported (required for emojis, full Unicode).');
      } else {
        console.log('   ⚠️ Recommended charset is utf8mb4. Migrations will enforce utf8mb4 for tables.');
      }
    } catch {
      console.log('   ℹ️ Could not query default database collation; tables will use migration collations.');
    }

    // 3. Inspect existing tables
    const tablesResult = await prisma.$queryRaw`SHOW TABLES`;
    const tableNames = tablesResult.map((row) => Object.values(row)[0]);
    console.log(`\n📋 Existing Database Tables (${tableNames.length} found):`);

    if (tableNames.length === 0) {
      console.log('   Database is EMPTY. Ready for initial migration (`npx prisma migrate deploy`).');
    } else {
      console.log(`   Tables: ${tableNames.slice(0, 10).join(', ')}${tableNames.length > 10 ? '...' : ''}`);

      if (tableNames.includes('_prisma_migrations')) {
        const migrations = await prisma.$queryRaw`
          SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at ASC
        `;
        console.log(`\n📜 Applied Migrations (${migrations.length}):`);
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
    console.log('🎉 Verification completed successfully.');
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ Database connection / verification failed:');
    console.error(`   Message: ${err.message}`);
    if (err.code) {
      console.error(`   Error Code: ${err.code}`);
    }
    console.error('\nTroubleshooting tips:');
    console.error('1. Check if Hostinger Remote MySQL allows connections from your current IP.');
    console.error('2. Verify Hostinger database host, port (3306), database name, user, and password.');
    console.error('3. Ensure SSL is supported (DB_SSL=true) or provider certificates are valid.');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
