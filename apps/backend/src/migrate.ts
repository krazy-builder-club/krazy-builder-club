import { runMigrations } from '@bob/storage';
import { loadDotEnv } from './config/env.js';

/**
 * Migration entrypoint for `pnpm db:migrate` and the IAM-only Cloud Run migration job.
 * Connects as the schema-owning migrator; a failure exits non-zero and stops the deploy.
 */
loadDotEnv();
const url = process.env.MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('MIGRATOR_DATABASE_URL (or DATABASE_URL) is required');
  process.exit(2);
}
await runMigrations(url);
console.log(JSON.stringify({ severity: 'INFO', message: 'migrations_applied' }));
