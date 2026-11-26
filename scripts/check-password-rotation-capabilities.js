import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

function safeStringify(obj) {
  return JSON.stringify(obj, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2);
}

const prodEnvPath = path.resolve(process.cwd(), '.env.production.local');
const env = dotenv.parse(fs.readFileSync(prodEnvPath));

const host = env.DB_HOST || 'srv1824.hstgr.io';
const port = parseInt(env.DB_PORT || '3306', 10);
const user = env.DB_USER;
const pass = encodeURIComponent(env.DB_PASSWORD);
const db = env.DB_NAME;

const url = `mysql://${user}:${pass}@${host}:${port}/${db}?sslaccept=strict&connection_limit=2`;

async function checkCapabilities() {
  console.log('================================================================');
  console.log('🔍 MARIADB SELF-SERVICE PASSWORD ROTATION CAPABILITY CHECK');
  console.log(`Target: ${host}:${port}`);
  console.log(`User: ${user}`);
  console.log(`Database: ${db}`);
  console.log('================================================================\n');

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const grants = await prisma.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER');
    console.log('1. Effective User Grants:');
    console.log(safeStringify(grants));

    const info = await prisma.$queryRawUnsafe('SELECT CURRENT_USER() as currentUser, USER() as authenticatedUser, @@version as version, @@read_only as readOnly');
    console.log('\n2. User & Server State:');
    console.log(safeStringify(info));

    // Check information_schema.user_privileges
    try {
      const privs = await prisma.$queryRawUnsafe("SELECT * FROM information_schema.user_privileges WHERE GRANTEE LIKE '%u740799251_intellicore%'");
      console.log('\n3. Global User Privileges in information_schema:');
      console.log(safeStringify(privs));
    } catch (e) {
      console.log('\n3. Global Privileges lookup:', e.message);
    }

    // Check schema privileges
    try {
      const schemaPrivs = await prisma.$queryRawUnsafe("SELECT * FROM information_schema.schema_privileges WHERE GRANTEE LIKE '%u740799251_intellicore%'");
      console.log('\n4. Schema Privileges in information_schema:');
      console.log(safeStringify(schemaPrivs));
    } catch (e) {
      console.log('\n4. Schema Privileges lookup:', e.message);
    }

    // Check MariaDB system variables regarding password change and plugins
    try {
      const sysVars = await prisma.$queryRawUnsafe("SHOW VARIABLES LIKE '%password%'");
      console.log('\n5. Password System Variables (sample):');
      console.log(safeStringify(sysVars));
    } catch (e) {
      console.log('\n5. System Variables lookup:', e.message);
    }

  } catch (err) {
    console.error('❌ Capability check failed:', err);
  } finally {
    await prisma.$disconnect();
    console.log('\nDisconnected cleanly.');
  }
}

checkCapabilities();
