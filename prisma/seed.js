import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const initialSettings = [
  {
    key: 'app.name',
    value: 'IntelliCore',
    description: 'Official application title',
    category: 'general',
    isPublic: true
  },
  {
    key: 'app.version',
    value: '2.0.0',
    description: 'Application release version',
    category: 'general',
    isPublic: true
  },
  {
    key: 'app.environment',
    value: 'development',
    description: 'Active deployment environment',
    category: 'general',
    isPublic: false
  },
  {
    key: 'app.timezone',
    value: 'Asia/Kolkata',
    description: 'Official business operation timezone',
    category: 'localization',
    isPublic: true
  },
  {
    key: 'working_hours.start',
    value: '09:30',
    description: 'Daily business opening hours (IST)',
    category: 'attendance',
    isPublic: true
  },
  {
    key: 'working_hours.end',
    value: '18:30',
    description: 'Daily business closing hours (IST)',
    category: 'attendance',
    isPublic: true
  },
  {
    key: 'working_days',
    value: 'Monday,Tuesday,Wednesday,Thursday,Friday',
    description: 'Official working days of the week',
    category: 'attendance',
    isPublic: true
  }
];

async function seed() {
  console.log('🌱 Starting idempotent Prisma database seed...');

  for (const setting of initialSettings) {
    const record = await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {
        value: setting.value,
        description: setting.description,
        category: setting.category,
        isPublic: setting.isPublic
      },
      create: setting
    });
    console.log(`  ✓ Setting verified: ${record.key} = "${record.value}"`);
  }

  console.log('✅ Idempotent seed completed successfully.');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

