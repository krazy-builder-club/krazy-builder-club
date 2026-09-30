import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
/** A transaction handle; repositories only ever receive one of these, already scoped. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type Database = {
  db: Db;
  pool: pg.Pool;
  close: () => Promise<void>;
};

export type PoolOptions = {
  /** Architecture caps each process at five connections (docs/architecture.md). */
  max?: number;
  connectionTimeoutMillis?: number;
  onPoolError?: (error: Error) => void;
};

export function createDatabase(url: string, options: PoolOptions = {}): Database {
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 5,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
  });
  // An idle client error (e.g. server restart) must not crash the process.
  pool.on(
    'error',
    options.onPoolError ?? ((error) => console.error('[db] idle pool error', error.message)),
  );
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

/**
 * Runs `fn` in a transaction whose RLS context is `workspaceId`. `set_config(..., true)` is
 * transaction-local, so a pooled connection never carries a previous tenant's context.
 */
export async function withWorkspace<T>(
  db: Db,
  workspaceId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    return fn(tx);
  });
}

/** Readiness probe: database reachability only, never customer content or the model. */
export async function pingDatabase(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
