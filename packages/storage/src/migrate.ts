import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './db.js';

/** Resolved from this file so it works from `src/` (tsx) and `dist/` (node) alike. */
export const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Applies pending migrations as the schema-owning migrator role. Used by the job and tests. */
export async function runMigrations(url: string): Promise<void> {
  const { db, close } = createDatabase(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}
