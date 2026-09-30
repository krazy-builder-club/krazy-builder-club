import { randomUUID } from 'node:crypto';
import { BRAIN_TREE } from '@bob/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiApp,
  call,
  closePools,
  createCustomerDirect,
  createWorkspace,
  dbAvailable,
  FULL,
  issueKey,
  openPools,
  type Pools,
} from './helpers.js';

const ALL_PATHS = BRAIN_TREE.flatMap((f) => [...f.documents]);

describe.skipIf(!dbAvailable())('brain, query and identity routes', () => {
  let pools: Pools;
  let app: ReturnType<typeof apiApp>;
  let ws: string;
  let full: string;

  beforeAll(async () => {
    pools = openPools();
    app = apiApp(pools);
    ws = await createWorkspace(pools);
    full = (await issueKey(pools, ws, { capabilities: FULL })).token;
  });
  afterAll(() => closePools(pools));

  const newCustomer = async (json: Record<string, unknown> = {}) => {
    const res = await call(app, 'POST', '/v1/customers', {
      token: full,
      json: { external_id: `c-${randomUUID()}`, ...json },
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; external_id: string; current_brain_version: number };
  };
  const ask = (
    customerId: string,
    extra: Record<string, unknown> = {},
    key = randomUUID(),
    token = full,
    a = app,
  ) =>
    call(a, 'POST', `/v1/customers/${customerId}/query`, {
      token,
      idempotencyKey: key,
      json: { question: 'Is the customer moving?', ...extra },
    });

  describe('skeleton brain', () => {
    it('is committed with the customer as version 1', async () => {
      const customer = await newCustomer();
      expect(customer.current_brain_version).toBe(1);
      const res = await call(app, 'GET', `/v1/customers/${customer.id}/brain`, { token: full });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        customer_id: customer.id,
        version: 1,
        source_watermark: 0,
        current_source_revision: 0,
        has_pending_sources: false,
      });
      expect(Object.keys(res.body.documents).sort()).toEqual([...ALL_PATHS].sort());
      expect(res.body.tree.map((f: { folder: string }) => f.folder)).toEqual(
        BRAIN_TREE.map((f) => f.folder),
      );
      expect(res.body.structured.assertions).toEqual([]);
      expect(res.headers.get('etag')).toBe(`"brain-${customer.id}-v1"`);
      expect(res.headers.get('x-bob-brain-version')).toBe('1');
      expect(res.headers.get('x-bob-pending-sources')).toBe('false');
    });

    it('reports pending sources when creation metadata was accepted', async () => {
      const customer = await newCustomer({ metadata: { segment: 'retail' } });
      const res = await call(app, 'GET', `/v1/customers/${customer.id}/brain`, { token: full });
      expect(res.body.version).toBe(1);
      expect(res.body.has_pending_sources).toBe(true);
      expect(res.headers.get('x-bob-pending-sources')).toBe('true');
    });

    it('serves a Markdown bundle containing every document', async () => {
      const customer = await newCustomer();
      const res = await call(app, 'GET', `/v1/customers/${customer.id}/brain?format=markdown`, {
        token: full,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
      for (const path of ALL_PATHS) expect(res.body).toContain(`<!-- file: ${path} -->`);
    });

    it('serves single documents and rejects unknown paths', async () => {
      const customer = await newCustomer();
      const base = `/v1/customers/${customer.id}/brain/document`;
      const ok = await call(app, 'GET', `${base}?path=situation/current.md`, { token: full });
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
      expect(ok.headers.get('x-bob-brain-version')).toBe('1');
      expect(ok.headers.get('etag')).toBe(`"brain-${customer.id}-v1"`);
      expect(ok.body).toContain('Situation');
      expect((await call(app, 'GET', `${base}?path=secrets.md`, { token: full })).status).toBe(400);
    });

    it('404s an unknown version and a missing brain', async () => {
      const customer = await newCustomer();
      const missing = await call(app, 'GET', `/v1/customers/${customer.id}/brain?version=99`, {
        token: full,
      });
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('not_found');

      const bare = await createCustomerDirect(pools, ws);
      const res = await call(app, 'GET', `/v1/customers/${bare}/brain`, { token: full });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('brain_not_ready');
    });

    it('hides the brain from keys lacking data:read or the customer grant', async () => {
      const customer = await newCustomer();
      const other = await newCustomer();
      const noRead = await issueKey(pools, ws, { capabilities: ['query:run'] });
      expect(
        (await call(app, 'GET', `/v1/customers/${customer.id}/brain`, { token: noRead.token }))
          .status,
      ).toBe(403);
      const scoped = await issueKey(pools, ws, {
        capabilities: ['data:read'],
        customerIds: [customer.id],
      });
      expect(
        (await call(app, 'GET', `/v1/customers/${other.id}/brain`, { token: scoped.token })).status,
      ).toBe(404);
      expect(
        (await call(app, 'GET', `/v1/customers/${customer.id}/brain`, { token: scoped.token }))
          .status,
      ).toBe(200);
    });
  });

  describe('query', () => {
    it('queues a query job visible to query:run keys only', async () => {
      const customer = await newCustomer();
      const res = await ask(customer.id);
      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({ status: 'queued', brain_version: 1 });

      const job = await call(app, 'GET', `/v1/jobs/${res.body.job_id}`, { token: full });
      expect(job.status).toBe(200);
      expect(job.body).toMatchObject({ kind: 'query', customer_id: customer.id, status: 'queued' });

      const reader = await issueKey(pools, ws, { capabilities: ['data:read'] });
      expect(
        (await call(app, 'GET', `/v1/jobs/${res.body.job_id}`, { token: reader.token })).status,
      ).toBe(404);
    });

    it('replays the same job for the same idempotency key and rejects a changed body', async () => {
      const customer = await newCustomer();
      const key = randomUUID();
      const first = await ask(customer.id, {}, key);
      const second = await ask(customer.id, {}, key);
      expect(second.status).toBe(202);
      expect(second.body.job_id).toBe(first.body.job_id);
      const changed = await ask(customer.id, { question: 'Something else?' }, key);
      expect(changed.status).toBe(409);
      expect(changed.body.error.code).toBe('idempotency_conflict');
    });

    it('requires an Idempotency-Key and the query:run capability', async () => {
      const customer = await newCustomer();
      const noKey = await call(app, 'POST', `/v1/customers/${customer.id}/query`, {
        token: full,
        json: { question: 'Hi?' },
      });
      expect(noKey.status).toBe(400);
      const reader = await issueKey(pools, ws, { capabilities: ['data:read'] });
      expect((await ask(customer.id, {}, randomUUID(), reader.token)).status).toBe(403);
    });

    it('404s a customer outside the key grant', async () => {
      const mine = await newCustomer();
      const other = await newCustomer();
      const scoped = await issueKey(pools, ws, {
        capabilities: ['query:run'],
        customerIds: [mine.id],
      });
      expect((await ask(other.id, {}, randomUUID(), scoped.token)).status).toBe(404);
      expect((await ask(mine.id, {}, randomUUID(), scoped.token)).status).toBe(202);
    });

    it('409s brain_not_ready when no snapshot exists', async () => {
      const bare = await createCustomerDirect(pools, ws);
      const res = await ask(bare);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('brain_not_ready');
    });

    it('validates the body', async () => {
      const customer = await newCustomer();
      expect((await ask(customer.id, { question: '  ' })).status).toBe(422);
      expect((await ask(customer.id, { wait_seconds: 26 })).status).toBe(422);
    });

    it('answers 202 when the wait ends without a worker', async () => {
      const customer = await newCustomer();
      const started = Date.now();
      const res = await ask(customer.id, { wait_seconds: 1 });
      expect(res.status).toBe(202);
      expect(res.body.status).toBe('queued');
      expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    });

    it('spends the model admission group', async () => {
      const limited = apiApp(pools, { mutation: 1000, read: 1000, model: 1 });
      const customer = await newCustomer();
      // Counters are per key and minute window, so use a key no other test has spent.
      const fresh = (await issueKey(pools, ws, { capabilities: FULL })).token;
      const first = await ask(customer.id, {}, randomUUID(), fresh, limited);
      expect(first.status).toBe(202);
      const second = await ask(customer.id, {}, randomUUID(), fresh, limited);
      expect(second.status).toBe(429);
      expect(second.body.error.code).toBe('rate_limited');
      expect(second.headers.get('retry-after')).toBeTruthy();
    });
  });

  describe('identity and lookup', () => {
    it('describes the presented key', async () => {
      const scoped = await issueKey(pools, ws, { capabilities: ['data:read', 'query:run'] });
      const res = await call(app, 'GET', '/v1/me', { token: scoped.token });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        workspace_id: ws,
        key_id: scoped.keyId,
        capabilities: ['data:read', 'query:run'],
        all_customers: true,
      });
      expect((await call(app, 'GET', '/v1/me')).status).toBe(401);
    });

    it('filters customers by exact external_id within the grant', async () => {
      const customer = await newCustomer();
      const other = await newCustomer();
      const hit = await call(
        app,
        'GET',
        `/v1/customers?external_id=${encodeURIComponent(customer.external_id)}`,
        { token: full },
      );
      expect(hit.body.items.map((c: { id: string }) => c.id)).toEqual([customer.id]);
      const miss = await call(app, 'GET', '/v1/customers?external_id=nobody', { token: full });
      expect(miss.body.items).toEqual([]);
      const scoped = await issueKey(pools, ws, {
        capabilities: ['data:read'],
        customerIds: [other.id],
      });
      const hidden = await call(
        app,
        'GET',
        `/v1/customers?external_id=${encodeURIComponent(customer.external_id)}`,
        { token: scoped.token },
      );
      expect(hidden.body.items).toEqual([]);
    });
  });
});
