import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';

describe('Integration: Security Policies & Hardening', () => {
  it('should include Helmet security headers on responses', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('should include X-Request-Id header on all responses', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id'].length).toBeGreaterThan(10);
  });

  it('should forbid direct access to sensitive .env file', async () => {
    const res = await request(app).get('/.env');
    expect(res.status).toBe(403);
  });

  it('should forbid direct access to sensitive prisma schema', async () => {
    const res = await request(app).get('/prisma/schema.prisma');
    expect(res.status).toBe(403);
  });
});

