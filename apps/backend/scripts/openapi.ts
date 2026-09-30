import { writeFileSync } from 'node:fs';
import type { Db } from '@bob/storage';
import { createApiApp, openApiInfo } from '../src/api/app.js';

/** Writes the generated OpenAPI 3.1 document; CI fails when the committed copy is stale. */
const app = createApiApp({
  db: {} as Db,
  apiKeyPepper: 'openapi-generation-only-not-a-secret',
  admissionLimits: { mutation: 1, read: 1, model: 1 },
});
const document = app.getOpenAPI31Document(openApiInfo);
writeFileSync(
  new URL('../openapi.json', import.meta.url),
  `${JSON.stringify(document, null, 2)}\n`,
);
console.log('wrote apps/backend/openapi.json');
