import { describe, expect, it } from 'vitest';
import {
  buildDatabaseUrl,
  sanitizeDatabaseUrl,
  resolveDatabaseConfiguration
} from '../../backend/src/config/databaseUrl.js';

describe('Unit: Database URL Construction & Resolution', () => {
  it('constructs a valid Prisma MySQL URL from individual variables with standard port and SSL', () => {
    const url = buildDatabaseUrl({
      host: 'sql123.main-hosting.eu',
      port: 3306,
      database: 'u123456789_intellicore',
      user: 'u123456789_app',
      password: 'simplepassword',
      ssl: true
    });

    expect(url).toBe('mysql://u123456789_app:simplepassword@sql123.main-hosting.eu:3306/u123456789_intellicore?sslaccept=strict');
  });

  it('correctly URL-encodes special characters in username and password', () => {
    const url = buildDatabaseUrl({
      host: 'db.example.com',
      port: 3306,
      database: 'mydb',
      user: 'user@name#1',
      password: 'p@ss/word:with%special?chars&!',
      ssl: true
    });

    const parsed = new URL(url);
    expect(decodeURIComponent(parsed.username)).toBe('user@name#1');
    expect(decodeURIComponent(parsed.password)).toBe('p@ss/word:with%special?chars&!');
    expect(parsed.searchParams.get('sslaccept')).toBe('strict');
  });

  it('omits sslaccept when ssl is false', () => {
    const url = buildDatabaseUrl({
      host: 'localhost',
      port: 3306,
      database: 'local_db',
      user: 'root',
      password: 'pass',
      ssl: false
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.has('sslaccept')).toBe(false);
  });

  it('sanitizes passwords from connection URLs for logging', () => {
    const raw = 'mysql://u123_app:superSecretPassword123!@sql100.hostinger.com:3306/u123_db?sslaccept=strict';
    const sanitized = sanitizeDatabaseUrl(raw);

    expect(sanitized).toBe('mysql://u123_app:****@sql100.hostinger.com:3306/u123_db?sslaccept=strict');
    expect(sanitized).not.toContain('superSecretPassword123!');
  });

  it('detects conflicting configuration when DATABASE_URL host does not match DB_HOST', () => {
    expect(() =>
      resolveDatabaseConfiguration({
        DATABASE_URL: 'mysql://user:pass@host-a.com:3306/db_name',
        DB_HOST: 'host-b.com'
      })
    ).toThrow(/Conflicting database configuration/);
  });

  it('detects conflicting configuration when DATABASE_URL database does not match DB_NAME', () => {
    expect(() =>
      resolveDatabaseConfiguration({
        DATABASE_URL: 'mysql://user:pass@host-a.com:3306/db_one',
        DB_HOST: 'host-a.com',
        DB_NAME: 'db_two'
      })
    ).toThrow(/Conflicting database configuration/);
  });

  it('throws an error if individual database variables are incomplete', () => {
    expect(() =>
      resolveDatabaseConfiguration({
        DB_HOST: 'sql.hostinger.com',
        DB_USER: 'app_user'
        // Missing DB_NAME, DB_PASSWORD
      })
    ).toThrow(/Incomplete database configuration: missing required variable\(s\)/);
  });

  it('blocks insecure TLS bypass (accept_invalid_certs)', () => {
    expect(() =>
      resolveDatabaseConfiguration({
        DATABASE_URL: 'mysql://user:pass@remote.host:3306/db?sslaccept=accept_invalid_certs'
      })
    ).toThrow(/Insecure TLS configuration detected/);
  });

  it('refuses silent fallback to localhost in production', () => {
    expect(() =>
      resolveDatabaseConfiguration({
        NODE_ENV: 'production'
      })
    ).toThrow(/Database configuration missing in production/);
  });

  it('refuses localhost connection in production', () => {
    expect(() =>
      resolveDatabaseConfiguration({
        NODE_ENV: 'production',
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_NAME: 'prod_db',
        DB_USER: 'prod_user',
        DB_PASSWORD: 'prod_password'
      })
    ).toThrow(/Production database cannot connect to a localhost \/ loopback address/);
  });

  it('successfully resolves individual variables when DATABASE_URL is not set', () => {
    const config = resolveDatabaseConfiguration({
      DB_HOST: 'srv100.hstgr.io',
      DB_PORT: '3306',
      DB_NAME: 'u123_intellicore',
      DB_USER: 'u123_app',
      DB_PASSWORD: 'secure_password_999',
      DB_SSL: 'true'
    });

    expect(config.databaseUrl).toBe(
      'mysql://u123_app:secure_password_999@srv100.hstgr.io:3306/u123_intellicore?sslaccept=strict'
    );
  });
});
