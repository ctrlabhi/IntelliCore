import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';

describe('Integration: Health & Readiness Probes', () => {
  it('GET /health should return 200 with UP status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.service).toBe('intellicore-api');
    expect(res.body.version).toBe('2.0.0');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /ready should return 200 or 503 based on DB connectivity', async () => {
    const res = await request(app).get('/ready');
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.status).toBe('READY');
      expect(res.body.database).toBe('CONNECTED');
    } else {
      expect(res.body.status).toBe('NOT_READY');
      expect(res.body.database).toBe('DISCONNECTED');
    }
  });
});

