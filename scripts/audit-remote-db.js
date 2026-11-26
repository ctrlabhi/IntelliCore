import fs from 'node:fs';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const env = dotenv.parse(fs.readFileSync('.env.production.local'));
const host = env.DB_HOST || 'srv1824.hstgr.io';
const user = env.DB_USER;
const pass = encodeURIComponent(env.DB_PASSWORD);
const db = env.DB_NAME;
const port = env.DB_PORT || 3306;

const url = `mysql://${user}:${pass}@${host}:${port}/${db}?sslaccept=strict&connection_limit=2`;
const prisma = new PrismaClient({ datasourceUrl: url });

async function audit() {
  console.log('--- 1. PING / SELECT 1 ---');
  const ping = await prisma.$queryRawUnsafe('SELECT 1 as alive');
  console.log('Ping result:', ping);

  console.log('\n--- 2. ENGINE & HOSTNAME ---');
  const serverInfo = await prisma.$queryRawUnsafe('SELECT @@version as version, @@version_comment as comment, @@hostname as hostname, @@ssl_cipher as cipher');
  console.log('Server info:', serverInfo);

  console.log('\n--- 3. GRANTS ---');
  const grants = await prisma.$queryRawUnsafe('SHOW GRANTS');
  console.log('Grants:', grants);

  console.log('\n--- 4. TABLE COUNTS & STORAGE ---');
  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name, table_rows, data_length, index_length 
    FROM information_schema.tables 
    WHERE table_schema = '${db}' 
    ORDER BY table_name ASC
  `);
  console.log('Total tables in schema:', tables.length);
  const totalBytes = tables.reduce((acc, t) => acc + Number(t.data_length || 0) + Number(t.index_length || 0), 0);
  console.log('Total database storage used (data + indexes):', (totalBytes / 1024).toFixed(2), 'KB');

  console.log('\n--- 5. PRISMA MIGRATIONS TABLE ---');
  const migrations = await prisma.$queryRawUnsafe('SELECT migration_name, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY finished_at ASC');
  console.log('Applied migrations count:', migrations.length);
  migrations.forEach(m => console.log(' - ' + m.migration_name + ' (steps: ' + m.applied_steps_count + ', applied: ' + m.finished_at + ')'));

  console.log('\n--- 6. FOUNDATION RECORDS AUDIT ---');
  const rolesCount = await prisma.role.count();
  const permissionsCount = await prisma.permission.count();
  const departmentsCount = await prisma.department.count();
  const settingsCount = await prisma.systemSetting.count();
  const usersCount = await prisma.user.count();

  console.log('System settings count:', settingsCount);
  console.log('Roles count:', rolesCount);
  console.log('Permissions count:', permissionsCount);
  console.log('Departments count:', departmentsCount);
  console.log('Registered Users count:', usersCount);

  if (usersCount > 0) {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, status: true, userRoles: { select: { role: { select: { code: true } } } } }
    });
    console.log('Existing users in database:', JSON.stringify(users));
  }

  await prisma.$disconnect();
  console.log('\n✅ REMOTE DATABASE AUDIT COMPLETED 100% SUCCESSFULLY');
}

audit().catch(e => {
  console.error('Audit failed:', e);
  process.exit(1);
});
