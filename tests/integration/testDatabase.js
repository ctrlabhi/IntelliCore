export const founderFixture = { uid: 'intellicore-test-founder', email: 'founder@example.test' };

export function isolatedDatabaseUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'mysql:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && /^\/intellicore_test_[a-z0-9_]+$/.test(url.pathname)
      && /^intellicore_test_[a-z0-9_]+$/.test(decodeURIComponent(url.username))
      && url.port && url.password && !url.search && !url.hash) {
      return url.href;
    }
  } catch {
    // Avoid echoing a malformed connection string.
  }
  throw new Error('Use a loopback MySQL URL for a dedicated intellicore_test_* database and user, with explicit port and no URL options.');
}

export function hasIsolatedDatabase() {
  const testDatabase = isolatedDatabaseUrl(process.env.INTELLICORE_TEST_DATABASE_URL);
  return Boolean(testDatabase && process.env.DATABASE_URL === testDatabase);
}
