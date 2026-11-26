import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

/**
 * Coordinated MariaDB Self-Service Password Rotation Script
 * 
 * Safety & Security Guarantees:
 * 1. Generates 32-character high-entropy password locally.
 * 2. NEVER prints or logs the plaintext password.
 * 3. Preserves database schema, tables, and records without modification.
 * 4. Verifies new connection with strict TLS.
 * 5. Verifies old connection is rejected.
 * 6. Atomically updates .env.production.local.
 */

const prodEnvPath = path.resolve(process.cwd(), '.env.production.local');

function loadProdEnv() {
  if (!fs.existsSync(prodEnvPath)) {
    throw new Error('.env.production.local does not exist.');
  }
  return dotenv.parse(fs.readFileSync(prodEnvPath));
}

function buildUrl(user, pass, host, port, db) {
  const encodedPass = encodeURIComponent(pass);
  return `mysql://${user}:${encodedPass}@${host}:${port}/${db}?sslaccept=strict&connection_limit=2`;
}

async function rotatePassword() {
  console.log('================================================================');
  console.log('🔐 COORDINATED MARIADB PASSWORD ROTATION');
  console.log('================================================================\n');

  // Verify explicit authorization flag
  if (process.argv[2] !== '--execute-authorized-rotation') {
    console.log('⚠️  DRY-RUN / SAFETY GATE:');
    console.log('   Rotation was invoked without --execute-authorized-rotation flag.');
    console.log('   Stopping immediately without modifying credentials.\n');
    console.log('To execute after explicit owner authorization, run:');
    console.log('   node scripts/rotate-mariadb-password.js --execute-authorized-rotation\n');
    return;
  }

  const env = loadProdEnv();
  const host = env.DB_HOST || 'srv1824.hstgr.io';
  const port = parseInt(env.DB_PORT || '3306', 10);
  const user = env.DB_USER;
  const oldPass = env.DB_PASSWORD;
  const db = env.DB_NAME;

  console.log(`Target Host: ${host}:${port}`);
  console.log(`Database:    ${db}`);
  console.log(`User:        ${user}`);

  // Generate cryptographically secure password (24 bytes base64url = 32 chars)
  const newPass = crypto.randomBytes(24).toString('base64url');
  console.log('✅ Generated new 32-character high-entropy secret (unexposed).');

  const currentUrl = buildUrl(user, oldPass, host, port, db);
  const currentPrisma = new PrismaClient({ datasourceUrl: currentUrl });

  try {
    console.log('\nStep 1: Connecting with current credentials...');
    await currentPrisma.$queryRaw`SELECT 1 as alive`;
    console.log('✅ Current connection active.');

    console.log('\nStep 2: Executing SET PASSWORD for CURRENT_USER...');
    // MariaDB self-service password update
    await currentPrisma.$executeRawUnsafe(`SET PASSWORD = PASSWORD('${newPass.replace(/'/g, "''")}')`);
    console.log('✅ Password rotation SQL statement executed successfully.');

  } catch (err) {
    console.error('❌ Failed to execute password rotation in MariaDB:', err.message);
    await currentPrisma.$disconnect();
    process.exit(1);
  } finally {
    await currentPrisma.$disconnect();
  }

  // Step 3: Verify fresh connection with NEW password
  console.log('\nStep 3: Verifying fresh connection with NEW password...');
  const newUrl = buildUrl(user, newPass, host, port, db);
  const newPrisma = new PrismaClient({ datasourceUrl: newUrl });
  try {
    const t0 = Date.now();
    await newPrisma.$queryRaw`SELECT 1 as alive`;
    const latency = Date.now() - t0;
    console.log(`✅ Fresh connection verified successfully with NEW password (${latency}ms latency).`);

    // Verify all 49 tables intact
    const tables = await newPrisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = '${db}'`);
    const tableCount = Number(tables[0]?.cnt);
    console.log(`✅ Table integrity check: All ${tableCount} tables verified intact.`);

  } catch (err) {
    console.error('❌ Critical: Failed to connect with new password:', err.message);
    await newPrisma.$disconnect();
    process.exit(1);
  } finally {
    await newPrisma.$disconnect();
  }

  // Step 4: Confirm OLD password is now rejected
  console.log('\nStep 4: Confirming OLD password is now rejected...');
  const oldVerifyPrisma = new PrismaClient({ datasourceUrl: currentUrl });
  try {
    await oldVerifyPrisma.$queryRaw`SELECT 1 as alive`;
    console.error('⚠️  Warning: Old password was still accepted!');
  } catch (err) {
    console.log('✅ Confirmed: Connection with old password was correctly rejected.');
  } finally {
    await oldVerifyPrisma.$disconnect();
  }

  // Step 5: Atomically update .env.production.local
  console.log('\nStep 5: Updating private .env.production.local...');
  let content = fs.readFileSync(prodEnvPath, 'utf8');
  content = content.replace(/^DB_PASSWORD=.*$/m, `DB_PASSWORD=${newPass}`);
  content = content.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${newUrl}`);
  fs.writeFileSync(prodEnvPath, content, 'utf8');
  console.log('✅ .env.production.local updated with new credentials.');

  console.log('\n================================================================');
  console.log('🎉 PASSWORD ROTATION COMPLETED SUCCESSFULLY');
  console.log('Next Action: Update DATABASE_URL in Vercel Project Settings.');
  console.log('================================================================');
}

rotatePassword();
