import { fileURLToPath } from 'node:url';

/**
 * Tests run workspace packages from source, never from a stale `dist/`. (Vitest's server-side
 * resolver does not apply the `@bob/source` export condition that tsc and tsx use.)
 */
export const sourceAliases = {
  '@bob/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
  '@bob/storage': fileURLToPath(new URL('./packages/storage/src/index.ts', import.meta.url)),
};
