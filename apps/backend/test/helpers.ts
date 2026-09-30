import { randomUUID } from 'node:crypto';
import type { Capability } from '@bob/contracts';
import {
  createDatabase,
  type Database,
  insertApiKey,
  insertCustomer,
  insertWorkspace,
  withWorkspace,
} from '@bob/storage';
import { inject } from 'vitest';
import { createApiApp } from '../src/api/app.js';
import { generateApiKey } from '../src/modules/identity/api-keys.js';

export const PEPPER = 'test-pepper-test-pepper-test-pepper-0123';
export const dbAvailable = () => inject('databaseUrls') !== undefined;

export type Pools = { operator: Database; api: Database; worker: Database };

export function openPools(): Pools {
  const urls = inject('databaseUrls');
  if (!urls) throw new Error('database suites require the global setup container');
  return {
    operator: createDatabase(urls.migrator, { max: 2 }),
    api: createDatabase(urls.api, { max: 5 }),
    worker: createDatabase(urls.worker, { max: 3 }),
  };
}

export const closePools = (p: Pools) =>
  Promise.all([p.operator.close(), p.api.close(), p.worker.close()]);

export function apiApp(pools: Pools, limits = { mutation: 1000, read: 1000, model: 1000 }) {
  return createApiApp({ db: pools.api.db, apiKeyPepper: PEPPER, admissionLimits: limits });
}

/** Operator-side setup: a workspace, as the CLI would create it. */
export async function createWorkspace(pools: Pools) {
  const workspaceId = randomUUID();
  await withWorkspace(pools.operator.db, workspaceId, (tx) =>
    insertWorkspace(tx, { id: workspaceId, name: `ws-${workspaceId.slice(0, 8)}` }),
  );
  return workspaceId;
}

export async function createCustomerDirect(pools: Pools, workspaceId: string) {
  const row = await withWorkspace(pools.operator.db, workspaceId, (tx) =>
    insertCustomer(tx, { workspaceId, externalId: `cust-${randomUUID()}` }),
  );
  if (!row) throw new Error('customer not created');
  return row.id;
}

export async function issueKey(
  pools: Pools,
  workspaceId: string,
  opts: {
    capabilities: Capability[];
    customerIds?: string[];
    expiresAt?: Date;
  },
) {
  const generated = generateApiKey(PEPPER);
  const key = await withWorkspace(pools.operator.db, workspaceId, (tx) =>
    insertApiKey(tx, {
      workspaceId,
      name: 'test',
      prefix: generated.prefix,
      keyHash: generated.keyHash,
      capabilities: opts.capabilities,
      allCustomers: !opts.customerIds,
      customerIds: opts.customerIds,
      expiresAt: opts.expiresAt,
    }),
  );
  return { token: generated.token, keyId: key.id };
}

export const FULL: Capability[] = [
  'customers:write',
  'sources:write',
  'data:read',
  'query:run',
  'insights:read',
  'feedback:write',
  'evaluate:run',
  'subscriptions:manage',
];

type App = ReturnType<typeof apiApp>;
// biome-ignore lint/suspicious/noExplicitAny: test convenience for asserting response shapes
type Response = { status: number; body: any; headers: globalThis.Headers };

/** Small request helper: JSON bodies, bearer auth and optional idempotency key. */
export async function call(
  app: App,
  method: string,
  path: string,
  opts: {
    token?: string;
    json?: unknown;
    text?: string;
    contentType?: string;
    idempotencyKey?: string;
  } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers['content-type'] = opts.contentType ?? 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.text !== undefined) {
    headers['content-type'] = opts.contentType ?? 'text/plain';
    body = opts.text;
  }
  const res = await app.request(path, { method, headers, body });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

export const envelope = (overrides: Record<string, unknown> = {}) => ({
  source: 'bank_demo',
  source_event_id: `msg-${randomUUID()}`,
  event_type: 'note',
  occurred_at: '2026-10-01T08:00:00Z',
  payload: { text: 'I am moving on 20 October and want help planning.' },
  ...overrides,
});
