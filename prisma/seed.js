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
  { code: 'users:update_status', description: 'Activate, suspend, or deactivate user accounts' },
  { code: 'staff:read', description: 'View staff directory and employment information' },
  { code: 'staff:create', description: 'Provision existing user accounts as staff members' },
  { code: 'staff:update', description: 'Update staff member profile details and designations' },
  { code: 'staff:update_status', description: 'Activate, suspend, or deactivate staff employment status' },
  { code: 'roles:read', description: 'View application role and permission mappings' },
  { code: 'roles:assign', description: 'Assign authorized staff roles to eligible users' },
  { code: 'roles:manage_permissions', description: 'Configure permissions mapped to non-protected roles' },
  { code: 'permissions:read', description: 'View system permissions catalog' },
  { code: 'audit_logs:read', description: 'View system security and administrative audit logs' },
  { code: 'analytics:read', description: 'View administrative overview and metrics statistics' },
  { code: 'departments:read', description: 'View company departments and tracks' },
  { code: 'departments:create', description: 'Create company departments' },
  { code: 'departments:update', description: 'Update department details and activation status' },
  { code: 'departments:assign_staff', description: 'Assign staff and team leaders to departments' },
  { code: 'applications:create_own', description: 'Create and draft own internship application' },
  { code: 'applications:read_own', description: 'Read own internship application' },
  { code: 'applications:read_all', description: 'Read all internship applications' },
  { code: 'applications:review', description: 'Request changes, approve or reject applications' },
  { code: 'internships:read_own', description: 'Read own internship details and history' },
  { code: 'internships:read_all', description: 'Read all internship records organization-wide' },
  { code: 'internships:read_department', description: 'Read interns within assigned departments' },
  { code: 'internships:manage', description: 'Update internship details, assign team leaders, terminate' },
  { code: 'internships:approve_completion', description: 'Approve completion of internship' },
  { code: 'attendance:read_all', description: 'View organization attendance' },
  { code: 'attendance:read_department', description: 'View attendance in assigned departments' },
  { code: 'attendance:export', description: 'Export attendance within authorized scope' },
  { code: 'attendance:manage_policy', description: 'Publish effective-dated attendance policy versions' },
  { code: 'attendance:review_corrections', description: 'Review attendance and late-report corrections' },
  { code: 'reports:read_all', description: 'View organization submitted daily reports' },
  { code: 'reports:read_department', description: 'View submitted daily reports in assigned departments' },
  { code: 'reports:review', description: 'Review submitted daily work reports' },
  { code: 'leaves:read_all', description: 'View internship leave requests' },
  { code: 'leaves:review', description: 'Approve, reject and reconcile internship leave requests' }
];

const initialDepartments = [
  { name: 'Human Resources', code: 'HR', slug: 'human-resources', description: 'Talent recruitment, onboarding, staff relations, and HR policies' },
  { name: 'Web Development', code: 'WEB_DEV', slug: 'web-development', description: 'Full-stack web engineering, frontend UI, REST APIs, and modern web applications' },
  { name: 'Data Analytics', code: 'DATA_ANALYTICS', slug: 'data-analytics', description: 'Data extraction, cleaning, exploratory data analysis, and predictive modeling' },
  { name: 'Business Analytics', code: 'BIZ_ANALYTICS', slug: 'business-analytics', description: 'Market research, stakeholder briefs, business requirement documents, and metric dashboards' },
  { name: 'Graphic Designing', code: 'GRAPHIC_DESIGN', slug: 'graphic-designing', description: 'Visual identity, UI brand assets, social collaterals, and multi-format design' },
  { name: 'Content Writing', code: 'CONTENT_WRITING', slug: 'content-writing', description: 'Technical documentation, editorial briefs, evidence-led articles, and copy strategy' },
  { name: 'Digital Marketing', code: 'DIGITAL_MARKETING', slug: 'digital-marketing', description: 'Performance marketing, search optimization, campaign planning, and growth analytics' },
  { name: 'Social Media Management', code: 'SOCIAL_MEDIA', slug: 'social-media-management', description: 'Social content calendars, engagement reporting, brand messaging, and moderation' },
  { name: 'WordPress Development', code: 'WORDPRESS_DEV', slug: 'wordpress-development', description: 'Custom WordPress theme architecture, CMS configuration, and plugin engineering' }
];

// Mapping roles to permission codes
const rolePermissionMatrix = {
  FOUNDER: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:founder', 'workspace:admin', 'workspace:hr', 'workspace:operations', 'workspace:team_leader', 'workspace:intern',
    'users:read', 'users:update_status',
    'staff:read', 'staff:create', 'staff:update', 'staff:update_status',
    'roles:read', 'roles:assign', 'roles:manage_permissions',
    'permissions:read', 'audit_logs:read', 'analytics:read',
    'departments:read', 'departments:create', 'departments:update', 'departments:assign_staff',
    'applications:create_own', 'applications:read_own', 'applications:read_all', 'applications:review',
    'internships:read_own', 'internships:read_all', 'internships:read_department', 'internships:manage', 'internships:approve_completion'
  ],
  CO_FOUNDER: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:founder', 'workspace:hr', 'workspace:operations', 'workspace:team_leader', 'workspace:intern',
    'users:read', 'users:update_status',
    'staff:read', 'staff:update', 'staff:update_status',
    'roles:read',
    'permissions:read', 'audit_logs:read', 'analytics:read',
    'departments:read',
    'applications:create_own', 'applications:read_own', 'applications:read_all', 'applications:review',
    'internships:read_own', 'internships:read_all', 'internships:read_department', 'internships:manage', 'internships:approve_completion'
  ],
  ADMIN: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:admin', 'users:read', 'staff:read', 'roles:read',
    'permissions:read', 'audit_logs:read', 'analytics:read',
    'departments:read', 'applications:read_all', 'internships:read_all'
  ],
  HR_MANAGER: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:hr', 'users:read', 'staff:read', 'analytics:read',
    'departments:read',
    'applications:read_all', 'applications:review',
    'internships:read_all', 'internships:manage', 'internships:approve_completion'
  ],
  HR_EXECUTIVE: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:hr', 'users:read', 'staff:read',
    'departments:read', 'applications:read_all', 'internships:read_all'
  ],
  OPERATIONS_EXECUTIVE: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:operations', 'staff:read',
    'departments:read', 'internships:read_all'
  ],
  TEAM_LEADER: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:team_leader', 'workspace:intern',
    'departments:read', 'internships:read_department'
  ],
  INTERN: [
    'auth:login', 'profile:read_own', 'profile:update_own',
    'workspace:intern',
    'departments:read',
    'applications:create_own', 'applications:read_own',
    'internships:read_own'
  ]
};

const attendanceView = ['attendance:read_all', 'reports:read_all'];
const attendanceReview = [...attendanceView, 'attendance:export', 'attendance:review_corrections',
  'reports:review', 'leaves:read_all', 'leaves:review'];
const attendanceGrants = {
  FOUNDER: [...attendanceReview, 'attendance:manage_policy'],
  CO_FOUNDER: attendanceView,
  ADMIN: attendanceView,
  HR_MANAGER: attendanceReview,
  HR_EXECUTIVE: attendanceView,
  OPERATIONS_EXECUTIVE: attendanceView,
  TEAM_LEADER: ['attendance:read_department', 'reports:read_department']
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
  for (const [roleCode, basePermissions] of Object.entries(rolePermissionMatrix)) {
    const permCodes = [...basePermissions, ...(attendanceGrants[roleCode] ?? [])];
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

  // 5. Seed Legitimate Departments (Phase 04)
  for (const dept of initialDepartments) {
    const record = await prisma.department.upsert({
      where: { code: dept.code },
      update: {},
      create: {
        name: dept.name,
        code: dept.code,
        slug: dept.slug,
        description: dept.description,
        isActive: true
      }
    });
    console.log(`  ✓ Department verified: ${record.name} (${record.code})`);
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
