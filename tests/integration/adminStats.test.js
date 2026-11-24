import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';

import { founderFixture, hasIsolatedDatabase } from './testDatabase.js';

const { uid: founderUid, email: founderEmail } = founderFixture;

describe.skipIf(!hasIsolatedDatabase())('Integration: Administrative Statistics (/api/v1/admin/stats)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/v1/admin/stats returns real MySQL aggregated counts for authorized users', async () => {
    vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
      uid: founderUid,
      email: founderEmail,
      email_verified: true,
      aud: 'intellicore-dev'
    });

    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', 'Bearer valid.founder.token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.users).toBeDefined();
    expect(typeof res.body.data.users.total).toBe('number');
    expect(typeof res.body.data.users.active).toBe('number');
    expect(typeof res.body.data.users.pending).toBe('number');

    expect(res.body.data.staff).toBeDefined();
    expect(typeof res.body.data.staff.total).toBe('number');

    expect(res.body.data.system).toBeDefined();
    expect(res.body.data.system.environment).toBe('test');
    expect(res.body.data).toMatchObject({
      departments: { active: expect.any(Number) },
      applications: expect.any(Object),
      internships: { ONGOING: expect.any(Number), COMPLETED: expect.any(Number) }
    });
    expect(res.body.data.system.timezone).toBe('Asia/Kolkata');
  });

  it('rejects unauthenticated requests to /api/v1/admin/stats with 401', async () => {
    const res = await request(app).get('/api/v1/admin/stats');
    expect(res.status).toBe(401);
  });
});
