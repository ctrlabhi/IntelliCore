import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';

describe('Integration: Static Website Serving & Dashboard Aliases', () => {
  it('GET / should serve the public index.html with 200 OK', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('IntelliCore');
  });

  it('GET /founder-dashboard.html should resolve to Founder dashboard', async () => {
    const res = await request(app).get('/founder-dashboard.html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Founder Command Center');
  });

  it('GET /hr-dashboard.html should resolve to HR dashboard', async () => {
    const res = await request(app).get('/hr-dashboard.html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('HR Dashboard');
  });

  it('GET /tl-dashboard.html should resolve to Team Leader dashboard', async () => {
    const res = await request(app).get('/tl-dashboard.html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('TL Dashboard');
  });

  it('GET /Intern-dashboard.html should resolve to Intern dashboard', async () => {
    const res = await request(app).get('/Intern-dashboard.html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Intern Dashboard');
  });

  it('GET /notes.html should resolve to AI Notes Studio', async () => {
    const res = await request(app).get('/notes.html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('IntelliCore Notes AI');
  });

  it('GET /favicon.png should serve brand favicon image', async () => {
    const res = await request(app).get('/favicon.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
  });

  it('GET /Photos/favicon.png should resolve via legacy backward-compatible alias', async () => {
    const res = await request(app).get('/Photos/favicon.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
  });
});

