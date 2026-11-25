import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { founderFixture, isolatedDatabaseUrl } from './testDatabase.js';

export default async function setup() {
  const databaseUrl = isolatedDatabaseUrl(process.env.INTELLICORE_TEST_DATABASE_URL);
  if (!databaseUrl) throw new Error('A dedicated MySQL test URL is required for fixture setup.');
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl };

  for (const [label, args] of [
    ['migration status', ['node_modules/prisma/build/index.js', 'migrate', 'status']],
    ['seed', ['prisma/seed.js']]
  ]) {
    const result = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 60000 });
    if (result.status !== 0) throw new Error(`Isolated MySQL test ${label} failed. Check the test database connection, grants, and generated client.`);
  }

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'FOUNDER' } });
    const { uid, email } = founderFixture;
    const founder = await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: { status: 'ACTIVE', emailVerified: true },
      create: { firebaseUid: uid, email, status: 'ACTIVE', emailVerified: true,
        profile: { create: { fullName: 'Test Founder' } } }
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: founder.id, roleId: role.id } },
      create: { userId: founder.id, roleId: role.id }, update: {}
    });
  } finally {
    await prisma.$disconnect();
  }
}
