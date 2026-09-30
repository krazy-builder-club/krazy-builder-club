import { defineConfig } from 'vitest/config';
import { sourceAliases } from '../../vitest.shared.js';

export default defineConfig({
  resolve: { alias: sourceAliases },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
