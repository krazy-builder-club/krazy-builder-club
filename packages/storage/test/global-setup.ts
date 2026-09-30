import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../src/migrate.js';

/**
 * One PostgreSQL 17 container per test run, shaped like Cloud SQL: migrations run as a
 * non-superuser `bob_migrator` (so FORCE RLS binds it), and the API/worker connect through
 * login roles that are members of `bob_api` / `bob_worker` — never a superuser, which would
 * silently bypass row security.
 *
 * CI must not skip these suites (docs/testing.md), so a missing Docker daemon fails the run
 * unless `BOB_ALLOW_DB_SKIP=1` is set explicitly for a local non-database iteration.
 */
let container: StartedPostgreSqlContainer | undefined;

export type TestDatabaseUrls = { migrator: string; api: string; worker: string };

function urlFor(base: string, user: string, password: string) {
  const url = new URL(base);
  url.username = user;
  url.password = password;
  return url.toString();
}

export async function setup(project: TestProject): Promise<void> {
  try {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
  } catch (error) {
    if (process.env.BOB_ALLOW_DB_SKIP === '1') {
      console.warn('[test] PostgreSQL unavailable; database suites SKIPPED (BOB_ALLOW_DB_SKIP=1).');
      return;
    }
    throw new Error(
      `PostgreSQL test container failed to start. Start Docker, or set BOB_ALLOW_DB_SKIP=1 to skip database suites locally. Cause: ${String(error)}`,
    );
  }
  const admin = new pg.Client({ connectionString: container.getConnectionUri() });
  await admin.connect();
  try {
    // The migrator owns the database, and so the `public` schema (via pg_database_owner).
    await admin.query(`CREATE ROLE bob_migrator LOGIN PASSWORD 'migrator' CREATEROLE`);
    await admin.query(`ALTER DATABASE ${container.getDatabase()} OWNER TO bob_migrator`);
  } finally {
    await admin.end();
  }

  const base = container.getConnectionUri();
  const urls: TestDatabaseUrls = {
    migrator: urlFor(base, 'bob_migrator', 'migrator'),
    api: urlFor(base, 'bob_api_login', 'api'),
    worker: urlFor(base, 'bob_worker_login', 'worker'),
  };
  await runMigrations(urls.migrator);

  const migrator = new pg.Client({ connectionString: urls.migrator });
  await migrator.connect();
  try {
    await migrator.query(`CREATE ROLE bob_api_login LOGIN PASSWORD 'api' IN ROLE bob_api`);
    await migrator.query(`CREATE ROLE bob_worker_login LOGIN PASSWORD 'worker' IN ROLE bob_worker`);
  } finally {
    await migrator.end();
  }
  project.provide('databaseUrls', urls);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrls?: TestDatabaseUrls;
  }
}
