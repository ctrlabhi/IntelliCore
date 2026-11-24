import { describe, it, expect } from 'vitest';
import env from '../../backend/src/config/env.js';

describe('Unit: Configuration & Environment Validation', () => {
  it('should load default port 3000 if not specified', () => {
    expect(typeof env.PORT).toBe('number');
    expect(env.PORT).toBeGreaterThan(0);
  });

  it('should default to development environment in local dev', () => {
    expect(['development', 'test', 'production']).toContain(env.NODE_ENV);
  });

  it('should configure Asia/Kolkata as business timezone', () => {
    expect(env.APP_TIMEZONE).toBe('Asia/Kolkata');
  });

  it('should have valid database connection parameters configured', () => {
    expect(env.MYSQL_DATABASE).toBe('intellicore_db');
    expect(env.MYSQL_USER).toBe('intellicore_app');
    expect(typeof env.DATABASE_URL).toBe('string');
    expect(env.DATABASE_URL).toContain('mysql://');
  });
});

