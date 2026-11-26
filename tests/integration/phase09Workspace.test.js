import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import prisma from '../../backend/src/config/database.js';
import firebase from '../../backend/src/integrations/firebase/firebaseService.js';
import { founderFixture, hasIsolatedDatabase } from './testDatabase.js';

const identities = new Map([['founder', founderFixture]]);
const auth = (actor = 'founder') => (actor.firebaseUid ?? actor) + '.synthetic';
let ipKey = 1;

function call(method, path, actor, body) {
  const req = request(app)[method]('/api/v1' + path)
    .set('X-Forwarded-For', '198.51.100.' + ipKey);
  if (actor) req.set('Authorization', 'Bearer ' + auth(actor));
  return body === undefined ? req : req.send(body);
}

const get = (path, actor) => call('get', path, actor);
const post = (path, data = {}, actor) => call('post', path, actor, data);
const patch = (path, data = {}, actor) => call('patch', path, actor, data);

async function createActor(role = 'INTERN', status = 'ACTIVE', emailVerified = true) {
  if (role === 'FOUNDER') {
    const existing = await prisma.user.findUnique({
      where: { firebaseUid: founderFixture.uid }
    });
    identities.set(founderFixture.uid, { ...founderFixture, emailVerified });
    if (existing) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { status, emailVerified }
      });
    }
    return prisma.user.create({
      data: {
        firebaseUid: founderFixture.uid,
        email: founderFixture.email,
        emailVerified,
        status,
        profile: { create: { fullName: 'Phase 09 Founder' } },
        userRoles: { create: { role: { connect: { code: 'FOUNDER' } } } }
      }
    });
  }
  const uid = randomUUID();
  const email = uid + '@example.test';
  identities.set(uid, { uid, email, emailVerified });
  return prisma.user.create({
    data: {
      firebaseUid: uid,
      email,
      emailVerified,
      status,
      profile: { create: { fullName: 'Phase 09 ' + role } },
      userRoles: { create: { role: { connect: { code: role } } } }
    }
  });
}

describe('Phase 09: Public Website, Clean Dashboard Routes & Security Guards', () => {
  it('serves clean dashboard URLs and legacy URLs with valid HTML content', async () => {
    const pages = [
      '/',
      '/notes',
      '/notes.html',
      '/dashboards/founder',
      '/founder-dashboard.html',
      '/dashboards/co-founder',
      '/cofounder-dashboard',
      '/dashboards/admin',
      '/admin-dashboard',
      '/dashboards/hr',
      '/hr-dashboard.html',
      '/dashboards/hr-executive',
      '/hr-executive-dashboard',
      '/dashboards/operations',
      '/operations-dashboard',
      '/dashboards/team-leader',
      '/tl-dashboard.html',
      '/dashboards/intern',
      '/Intern-dashboard.html'
    ];

    for (const page of pages) {
      const res = await request(app).get(page);
      expect(res.status, `Page ${page} failed with ${res.status}`).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    }
  });

  it('serves custom 404 for nonexistent frontend pages', async () => {
    const res = await request(app).get('/nonexistent-page-xyz-123');
    expect(res.status).toBe(404);
  });

  it('blocks sensitive files and infrastructure directories from HTTP serving', async () => {
    const sensitive = [
      '/.env',
      '/.env.example',
      '/.git/config',
      '/secrets/dev.json',
      '/prisma/schema.prisma',
      '/package.json',
      '/docker-compose.yml'
    ];

    for (const file of sensitive) {
      const res = await request(app).get(file);
      expect(res.status, `Expected ${file} to be blocked`).toBe(403);
    }
  });

  it('proves strict certificate API access controls and security boundaries', async () => {
    // 1. Unauthenticated requests to protected endpoints are rejected with 401
    const unauthGenerate = await request(app).post('/api/v1/certificates/generate');
    expect(unauthGenerate.status).toBe(401);

    const unauthDownload = await request(app).get('/api/v1/certificates/download');
    expect(unauthDownload.status).toBe(401);

    // 2. Public verification endpoints are active and accessible (returning 200 with validation result)
    const publicVerify = await request(app).get('/api/v1/certificates/verify/12345');
    expect(publicVerify.status).toBe(200);
    expect(publicVerify.body.data.valid).toBe(false);

    const publicVerifyQuery = await request(app).get('/api/v1/verify-certificate?code=12345');
    expect(publicVerifyQuery.status).toBe(200);
    expect(publicVerifyQuery.body.data.valid).toBe(false);

    // 3. Truly nonexistent endpoints return 404
    const probes404 = [
      ['get', '/api/v1/certificates'],
      ['get', '/api/v1/certificates/me'],
      ['get', '/certificates/me']
    ];
    for (const [method, route] of probes404) {
      const res = await request(app)[method](route);
      expect(res.status, `Route ${route} should not exist`).toBe(404);
    }
  });
});

describe.skipIf(!hasIsolatedDatabase())('Phase 09: Role Workspaces & Account State Enforcement against MySQL', () => {
  beforeAll(async () => {
    const founderRole = await prisma.role.findUnique({ where: { code: 'FOUNDER' } });
    if (founderRole) {
      await prisma.userRole.deleteMany({
        where: {
          roleId: founderRole.id,
          user: { firebaseUid: { not: founderFixture.uid } }
        }
      });
    }
  });

  beforeEach(() => {
    ipKey += 1;
    vi.spyOn(firebase, 'verifyIdToken').mockImplementation(async (token) => {
      const key = token.split('.')[0];
      const who = identities.get(key);
      if (!who) throw new Error('Unknown synthetic identity: ' + key);
      return {
        uid: who.uid,
        email: who.email,
        email_verified: who.emailVerified ?? true,
        aud: 'intellicore-dev',
        auth_time: Date.now() / 1000 - 20,
        firebase: { sign_in_provider: 'password' }
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('synchronizes all eight roles via auth bootstrap and generates role-appropriate workspace flags', async () => {
    const roles = [
      'FOUNDER',
      'CO_FOUNDER',
      'ADMIN',
      'HR_MANAGER',
      'HR_EXECUTIVE',
      'OPERATIONS_EXECUTIVE',
      'TEAM_LEADER',
      'INTERN'
    ];

    for (const role of roles) {
      const user = await createActor(role, 'ACTIVE', true);
      const res = await post('/auth/bootstrap', { fullName: 'Test ' + role }, user);
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.status).toBe('ACTIVE');
      expect(data.roles).toContain(role);

      // Verify role-appropriate workspace visibility
      if (role === 'FOUNDER' || role === 'CO_FOUNDER') {
        expect(data.workspaces.founder).toBe(true);
      } else if (role === 'ADMIN') {
        expect(data.workspaces.admin).toBe(true);
      } else if (role === 'HR_MANAGER' || role === 'HR_EXECUTIVE') {
        expect(data.workspaces.hr).toBe(true);
      } else if (role === 'OPERATIONS_EXECUTIVE') {
        expect(data.workspaces.operations).toBe(true);
      } else if (role === 'TEAM_LEADER') {
        expect(data.workspaces.teamLeader).toBe(true);
      } else if (role === 'INTERN') {
        expect(data.workspaces.intern).toBe(true);
      }
    }
  });

  it('rejects operational actions from suspended accounts with HTTP 403', async () => {
    const suspended = await createActor('INTERN', 'SUSPENDED', true);
    const res = await get('/users/me', suspended);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_STATUS_RESTRICTED');
    expect(res.body.error.details.status).toBe('SUSPENDED');
  });

  it('updates permitted profile fields safely while rejecting forbidden attribute injections', async () => {
    const user = await createActor('INTERN', 'ACTIVE', true);

    // Permitted fields update
    const updateRes = await patch('/users/me/profile', {
      fullName: 'Updated Name',
      displayName: 'Updated Display'
    }, user);
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.fullName).toBe('Updated Name');

    // Attempting to inject forbidden attributes
    const forbiddenRes = await patch('/users/me/profile', {
      role: 'FOUNDER',
      status: 'ACTIVE',
      isSystemRole: true
    }, user);
    expect(forbiddenRes.status).toBe(400);
  });

  it('strictly isolates Team Leader operations to active department assignments', async () => {
    const dept1 = await prisma.department.create({
      data: { name: 'P9 Dept 1', code: 'P9_D1_' + randomUUID().slice(0, 8), slug: 'p9-d1-' + randomUUID().slice(0, 8) }
    });
    const dept2 = await prisma.department.create({
      data: { name: 'P9 Dept 2', code: 'P9_D2_' + randomUUID().slice(0, 8), slug: 'p9-d2-' + randomUUID().slice(0, 8) }
    });

    const leader = await createActor('TEAM_LEADER', 'ACTIVE', true);
    await prisma.staffProfile.create({
      data: { userId: leader.id, staffCode: 'P9-STAFF-' + randomUUID().slice(0, 8), designation: 'Tech Lead', joiningDate: new Date() }
    });
    await prisma.userDepartment.create({
      data: { userId: leader.id, departmentId: dept1.id, assignedRole: 'TEAM_LEADER', isActive: true }
    });

    // Attempting department meeting in authorized dept1
    const allowed = await post('/meetings', {
      title: 'Dept 1 sync',
      description: 'Department meeting',
      audienceType: 'DEPARTMENT',
      departmentId: dept1.id,
      startAt: '2042-08-01T10:00:00Z',
      endAt: '2042-08-01T10:30:00Z',
      creationMode: 'MANUAL',
      meetingUrl: 'https://meet.google.com/abc-defg-hij'
    }, leader);
    expect(allowed.status).toBe(201);

    // Attempting department meeting in unauthorized dept2
    const denied = await post('/meetings', {
      title: 'Dept 2 sync',
      description: 'Unauthorized cross-dept meeting',
      audienceType: 'DEPARTMENT',
      departmentId: dept2.id,
      startAt: '2042-08-01T10:00:00Z',
      endAt: '2042-08-01T10:30:00Z',
      creationMode: 'MANUAL',
      meetingUrl: 'https://meet.google.com/abc-defg-hij'
    }, leader);
    expect(denied.status).toBe(403);
  });
});
