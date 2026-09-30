import { defineConfig } from 'vitest/config';
import { sourceAliases } from '../../vitest.shared.js';

export default defineConfig({
  resolve: { alias: sourceAliases },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Same Cloud SQL-shaped PostgreSQL container as the storage package.
    globalSetup: ['../../packages/storage/test/global-setup.ts'],
    // Files share one database and the worker tick is cross-workspace by design.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
