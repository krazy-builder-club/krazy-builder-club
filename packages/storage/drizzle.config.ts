import { defineConfig } from 'drizzle-kit';

// `db:generate` only diffs schema files; it never connects, so no DATABASE_URL is needed.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
});
