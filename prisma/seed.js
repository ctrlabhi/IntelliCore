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

const initialRoles = [
  { code: 'FOUNDER', name: 'Founder & Chief Executive', description: 'Primary founder with full executive authority', isSystemRole: true },
  { code: 'CO_FOUNDER', name: 'Co-Founder', description: 'Co-founder with executive privileges', isSystemRole: true },
  { code: 'ADMIN', name: 'System Administrator', description: 'Technical administrator managing systems and roles', isSystemRole: true },
  { code: 'HR_MANAGER', name: 'HR Manager', description: 'Human resources head overseeing staff and interns', isSystemRole: true },
  { code: 'HR_EXECUTIVE', name: 'HR Executive', description: 'Human resources specialist managing operations', isSystemRole: true },
  { code: 'OPERATIONS_EXECUTIVE', name: 'Operations Executive', description: 'Operations coordinator for company processes', isSystemRole: true },
  { code: 'TEAM_LEADER', name: 'Team Leader', description: 'Technical and project lead mentoring interns', isSystemRole: true },
  { code: 'INTERN', name: 'Intern', description: 'Default role for enrolled student interns', isSystemRole: true }
];

const initialPermissions = [
  { code: 'auth:login', description: 'Authenticate and maintain active session' },
  { code: 'profile:read_own', description: 'View own user profile and identity details' },
  { code: 'profile:update_own', description: 'Update permitted personal profile fields' },
  { code: 'workspace:founder', description: 'Access Founder and Executive dashboard workspace' },
  { code: 'workspace:admin', description: 'Access Technical Administration workspace' },
  { code: 'workspace:hr', description: 'Access HR Management dashboard workspace' },
  { code: 'workspace:operations', description: 'Access Operations dashboard workspace' },
  { code: 'workspace:team_leader', description: 'Access Team Leader dashboard workspace' },
  { code: 'workspace:intern', description: 'Access Intern dashboard and task workspace' },
  { code: 'users:read', description: 'View directory of application users' },
  { code: 'roles:read', description: 'View application role and permission mappings' }
];

// Mapping roles to permission codes
const rolePermissionMatrix = {
  FOUNDER: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:founder', 'workspace:admin', 'workspace:hr', 'workspace:operations', 'workspace:team_leader', 'workspace:intern',
    'users:read', 'roles:read'
  ],
  CO_FOUNDER: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:founder', 'workspace:hr', 'workspace:operations', 'workspace:team_leader', 'workspace:intern',
    'users:read', 'roles:read'
  ],
  ADMIN: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:admin', 'users:read', 'roles:read'
  ],
  HR_MANAGER: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:hr', 'users:read'
  ],
  HR_EXECUTIVE: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:hr'
  ],
  OPERATIONS_EXECUTIVE: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:operations'
  ],
  TEAM_LEADER: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:team_leader', 'workspace:intern'
  ],
  INTERN: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:intern'
  ]
};

async function seed() {
  console.log('🌱 Starting idempotent Prisma database seed...');

  // 1. Seed System Settings
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
    console.log(`  ✓ Setting verified: ${record.key}`);
  }

  // 2. Seed Permissions
  const permissionMap = new Map();
  for (const perm of initialPermissions) {
    const record = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description },
      create: perm
    });
    permissionMap.set(record.code, record.id);
    console.log(`  ✓ Permission verified: ${record.code}`);
  }

  // 3. Seed Roles
  const roleMap = new Map();
  for (const role of initialRoles) {
    const record = await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
        isSystemRole: role.isSystemRole
      },
      create: role
    });
    roleMap.set(record.code, record.id);
    console.log(`  ✓ Role verified: ${record.code}`);
  }

  // 4. Seed Role Permissions
  for (const [roleCode, permCodes] of Object.entries(rolePermissionMatrix)) {
    const roleId = roleMap.get(roleCode);
    if (!roleId) continue;

    for (const permCode of permCodes) {
      const permId = permissionMap.get(permCode);
      if (!permId) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId: permId
          }
        },
        update: {},
        create: {
          roleId,
          permissionId: permId
        }
      });
    }
    console.log(`  ✓ Role permissions mapped: ${roleCode} (${permCodes.length} permissions)`);
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
