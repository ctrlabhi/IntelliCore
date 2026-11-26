import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Prioritize .env.production.local
const prodEnvPath = path.resolve(process.cwd(), '.env.production.local');
const env = dotenv.parse(fs.readFileSync(prodEnvPath));

const host = env.DB_HOST || 'srv1824.hstgr.io';
const port = parseInt(env.DB_PORT || '3306', 10);
const user = env.DB_USER;
const pass = encodeURIComponent(env.DB_PASSWORD);
const db = env.DB_NAME;

// Strict TLS hostname validation enforced via sslaccept=strict
const url = `mysql://${user}:${pass}@${host}:${port}/${db}?sslaccept=strict&connection_limit=2`;

console.log('================================================================');
console.log('🔍 INTELLICORE V2.0 — TLS PROTOCOL & CIPHER DIAGNOSTICS');
console.log('================================================================');
console.log(`Target: ${host}:${port}`);
console.log(`Database: ${db}`);
console.log(`User: ${user}`);
console.log(`TLS Parameter: sslaccept=strict (Strict CA & Hostname validation)`);
console.log('----------------------------------------------------------------');

const prisma = new PrismaClient({
  datasourceUrl: url,
  log: []
});

async function runDiagnostics() {
  try {
    const t0 = Date.now();
    const ping = await prisma.$queryRaw`SELECT 1 as alive`;
    const latency = Date.now() - t0;
    console.log(`\n✅ 1. CONNECTIVITY CHECK (SELECT 1):`);
    console.log(`   Ping Result: `, ping);
    console.log(`   Round-trip Latency: ${latency}ms`);

    // 2. Server identity
    const serverInfo = await prisma.$queryRaw`
      SELECT @@version as version, @@version_comment as comment, @@hostname as hostname
    `;
    console.log(`\n🖥️ 2. SERVER ENGINE & IDENTITY:`);
    console.log(`   Version:  ${serverInfo[0]?.version}`);
    console.log(`   Comment:  ${serverInfo[0]?.comment}`);
    console.log(`   Hostname: ${serverInfo[0]?.hostname}`);

    // 3. SSL Status variables
    const sslStatus = await prisma.$queryRaw`SHOW STATUS LIKE 'Ssl_%'`;
    const sslMap = Object.fromEntries(sslStatus.map(r => [r.Variable_name, r.Value]));

    console.log(`\n🔒 3. ACTUAL NEGOTIATED TLS PROTOCOL & CIPHER:`);
    console.log(`   Ssl_version:             ${sslMap['Ssl_version'] || 'UNKNOWN'}`);
    console.log(`   Ssl_cipher:              ${sslMap['Ssl_cipher'] || 'NONE'}`);
    console.log(`   Ssl_cipher_list:         ${sslMap['Ssl_cipher_list'] ? (sslMap['Ssl_cipher_list'].substring(0, 80) + '...') : 'N/A'}`);
    console.log(`   Ssl_verify_mode:         ${sslMap['Ssl_verify_mode']}`);
    console.log(`   Ssl_server_not_before:   ${sslMap['Ssl_server_not_before']}`);
    console.log(`   Ssl_server_not_after:    ${sslMap['Ssl_server_not_after']}`);

    // 4. Grants verification
    const grants = await prisma.$queryRaw`SHOW GRANTS`;
    console.log(`\n🔑 4. CURRENT EFFECTIVE DATABASE GRANTS:`);
    grants.forEach((g, i) => {
      const grantSql = Object.values(g)[0];
      // Redact password hash if present
      const sanitizedGrant = grantSql.replace(/IDENTIFIED BY PASSWORD '\*[A-F0-9]+'/i, "IDENTIFIED BY PASSWORD '*REDACTED*'");
      console.log(`   [${i + 1}] ${sanitizedGrant}`);
    });

    // 5. Read-only Founder check
    console.log(`\n👤 5. READ-ONLY FOUNDER RECORD VERIFICATION:`);
    const founder = await prisma.user.findUnique({
      where: { email: 'ctrlabhishek@gmail.com' },
      select: {
        id: true,
        email: true,
        status: true,
        firebaseUid: true,
        userRoles: {
          select: {
            role: {
              select: { code: true, name: true }
            }
          }
        },
        profile: {
          select: { displayName: true }
        }
      }
    });

    if (founder) {
      console.log(`   ✅ Founder record found in database!`);
      console.log(`   User ID:     ${founder.id}`);
      console.log(`   Email:       ${founder.email}`);
      console.log(`   Status:      ${founder.status}`);
      console.log(`   Roles:       ${founder.userRoles.map(ur => ur.role.code).join(', ')}`);
      console.log(`   Display Name: ${founder.profile?.displayName}`);
    } else {
      console.log(`   ⚠️ Founder record NOT found.`);
    }

  } catch (err) {
    console.error('❌ Diagnostics failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('\nPrisma disconnected cleanly.');
  }
}

runDiagnostics();
