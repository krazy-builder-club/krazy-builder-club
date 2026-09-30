import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { createDatabase, type Database, withWorkspace } from '../src/db.js';
import { insertCustomer } from '../src/repositories/customers.js';
import { insertApiKey, insertWorkspace } from '../src/repositories/identity.js';

export const databaseUrls = () => inject('databaseUrls');
export const dbAvailable = () => databaseUrls() !== undefined;

export type Pools = { migrator: Database; api: Database; worker: Database };

export function openPools(): Pools {
  const urls = databaseUrls();
  if (!urls) throw new Error('database suites require the global setup container');
  return {
    migrator: createDatabase(urls.migrator, { max: 2 }),
    api: createDatabase(urls.api, { max: 3 }),
    worker: createDatabase(urls.worker, { max: 3 }),
  };
}

export async function closePools(pools: Pools) {
  await Promise.all([pools.migrator.close(), pools.api.close(), pools.worker.close()]);
}

/** Creates a synthetic workspace with one customer, as the operator would. */
export async function seedWorkspace(pools: Pools, name = 'test workspace') {
  const workspaceId = randomUUID();
  return withWorkspace(pools.migrator.db, workspaceId, async (tx) => {
    await insertWorkspace(tx, { id: workspaceId, name });
    const customer = await insertCustomer(tx, { workspaceId, externalId: `ext-${randomUUID()}` });
    if (!customer) throw new Error('seed customer not created');
    const key = await insertApiKey(tx, {
      workspaceId,
      name: 'seed',
      prefix: randomUUID().slice(0, 12),
      keyHash: randomUUID(),
      capabilities: ['data:read'],
      allCustomers: true,
    });
    return { workspaceId, customerId: customer.id, keyId: key.id };
  });
}
