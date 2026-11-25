import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { founderFixture, isolatedDatabaseUrl } from './tests/integration/testDatabase.js';

const testDatabase = isolatedDatabaseUrl(process.env.INTELLICORE_TEST_DATABASE_URL);
const databaseSuites = [
  'adminStats', 'auditLog', 'authEndpoints', 'roleEndpoints', 'staffEndpoints', 'userEndpoints', 'phase04MySql', 'phase05MySql', 'phase06MySql'
].map((name) => `tests/integration/${name}.test.js`);

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['functions/**', 'legacy-firebase/**', 'node_modules/**', ...(!testDatabase ? databaseSuites : [])],
    environment: 'node',
    globalSetup: testDatabase ? ['./tests/integration/mysqlSetup.js'] : [],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabase ?? 'mysql://test@127.0.0.1:1/intellicore_test_offline?connect_timeout=1',
      UPLOAD_DIR: resolve('node_modules', '.intellicore-test-uploads-' + process.pid),
      FIREBASE_PROJECT_ID: 'intellicore-dev',
      FOUNDER_FIREBASE_UID: founderFixture.uid,
      FOUNDER_EMAIL: founderFixture.email
    }
  }
});

