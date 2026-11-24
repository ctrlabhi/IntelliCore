import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['functions/**', 'legacy-firebase/**', 'node_modules/**'],
    environment: 'node'
  }
});
