import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';

describe('Integration: API Version 1 Endpoints', () => {
  it('GET /api/v1 should return API metadata and 200 status', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version).toBe('v1');
    expect(res.body.data.docs).toBe('/api-docs');
    expect(res.body.requestId).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /api/v1/health should return health diagnostic or 503', async () => {
    const res = await request(app).get('/api/v1/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body.data.service).toBe('intellicore-api');
    expect(res.body.data.apiVersion).toBe('v1');
  });

  it('GET /api/v1/nonexistent should return 404 with JSON error envelope', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(res.body.requestId).toBeDefined();
  });
});

