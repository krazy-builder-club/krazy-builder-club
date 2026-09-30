import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, withWorkspace } from '../src/db.js';
import { getCustomer, insertCustomer } from '../src/repositories/customers.js';
import { lookupApiKey } from '../src/repositories/identity.js';
import { claimOutbox } from '../src/repositories/jobs.js';
import { customers, TENANT_TABLES } from '../src/schema/index.js';
import {
  closePools,
  databaseUrls,
  dbAvailable,
  openPools,
  type Pools,
  seedWorkspace,
} from './fixtures.js';

/** Drizzle wraps driver errors; assert on the underlying PostgreSQL message. */
const pgError = (pattern: RegExp) => (error: unknown) =>
  error instanceof Error && pattern.test(String((error.cause as Error | undefined)?.message));

describe.skipIf(!dbAvailable())('tenant isolation (PostgreSQL RLS)', () => {
  let pools: Pools;
  let a: Awaited<ReturnType<typeof seedWorkspace>>;
  let b: Awaited<ReturnType<typeof seedWorkspace>>;

  beforeAll(async () => {
    pools = openPools();
    a = await seedWorkspace(pools, 'A');
    b = await seedWorkspace(pools, 'B');
  });
  afterAll(() => closePools(pools));

  it('forces RLS on every table that carries workspace_id, and only those in the list', async () => {
    const result = await pools.migrator.db.execute<{
      relname: string;
      enabled: boolean;
      forced: boolean;
    }>(sql`
      select c.relname, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'workspace_id')`);
    const names = result.rows.map((r) => r.relname).sort();
    expect(names).toEqual([...TENANT_TABLES].sort());
    for (const row of result.rows)
      expect(row, row.relname).toMatchObject({ enabled: true, forced: true });
  });

  it('runtime roles cannot bypass row security and own no tables', async () => {
    const roles = await pools.migrator.db.execute<{ rolname: string; rolbypassrls: boolean }>(
      sql`select rolname, rolbypassrls from pg_roles where rolname like 'bob_%'`,
    );
    for (const role of roles.rows) expect(role.rolbypassrls, role.rolname).toBe(false);
    const owned = await pools.migrator.db.execute<{ owner: string }>(
      sql`select distinct tableowner as owner from pg_tables where schemaname = 'public'`,
    );
    expect(owned.rows.map((r) => r.owner)).toEqual(['bob_migrator']);
  });

  it('sees no tenant rows without a workspace context', async () => {
    const rows = await pools.api.db.select().from(customers);
    expect(rows).toEqual([]);
  });

  it('scopes reads to the transaction workspace', async () => {
    const seen = await withWorkspace(pools.api.db, a.workspaceId, (tx) =>
      tx.select().from(customers),
    );
    expect(seen.map((c) => c.id)).toEqual([a.customerId]);
    const cross = await withWorkspace(pools.api.db, a.workspaceId, (tx) =>
      getCustomer(tx, { allCustomers: true }, b.customerId),
    );
    expect(cross).toBeUndefined();
  });

  it('rejects writes into another workspace', async () => {
    await expect(
      withWorkspace(pools.api.db, a.workspaceId, (tx) =>
        insertCustomer(tx, { workspaceId: b.workspaceId, externalId: 'smuggled' }),
      ),
    ).rejects.toSatisfy(pgError(/new row violates row-level security policy/));
  });

  it('does not leak context across pooled connections', async () => {
    const urls = databaseUrls();
    if (!urls) throw new Error('database suites require the global setup container');
    const single = createDatabase(urls.api, { max: 1 });
    try {
      await withWorkspace(single.db, a.workspaceId, (tx) => tx.select().from(customers));
      const after = await single.db.execute<{ ws: string | null }>(
        sql`select current_setting('app.workspace_id', true) as ws`,
      );
      expect(after.rows[0]?.ws ?? '').toBe('');
      expect(await single.db.select().from(customers)).toEqual([]);
    } finally {
      await single.close();
    }
  });

  it('binds the table owner too (FORCE RLS)', async () => {
    const rows = await pools.migrator.db.select().from(customers);
    expect(rows).toEqual([]);
  });

  it('resolves API keys by exact hash only, without a workspace context', async () => {
    const hash = `hash-${randomUUID()}`;
    await withWorkspace(pools.migrator.db, a.workspaceId, (tx) =>
      tx.execute(sql`insert into api_keys (workspace_id, name, prefix, key_hash, capabilities, all_customers)
                     values (${a.workspaceId}, 'lookup', ${randomUUID().slice(0, 12)}, ${hash}, '{data:read}', true)`),
    );
    const identity = await lookupApiKey(pools.api.db, hash);
    expect(identity).toMatchObject({ workspaceId: a.workspaceId, capabilities: ['data:read'] });
    expect(await lookupApiKey(pools.api.db, 'no-such-hash')).toBeUndefined();
    // Direct table access is still RLS-scoped for the API role.
    expect(await pools.api.db.execute(sql`select * from api_keys`)).toMatchObject({ rows: [] });
  });

  it('reserves cross-workspace transport functions for the worker role', async () => {
    await expect(claimOutbox(pools.api.db, ['librarian'], 1, 60)).rejects.toSatisfy(
      pgError(/permission denied for function bob_claim_outbox/),
    );
    await expect(claimOutbox(pools.worker.db, ['librarian'], 1, 60)).resolves.toBeInstanceOf(Array);
  });
});
