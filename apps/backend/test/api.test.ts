import { randomUUID } from 'node:crypto';
import { revokeApiKey, withWorkspace } from '@bob/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiApp,
  call,
  closePools,
  createCustomerDirect,
  createWorkspace,
  dbAvailable,
  envelope,
  FULL,
  issueKey,
  openPools,
  type Pools,
} from './helpers.js';

describe.skipIf(!dbAvailable())('public API', () => {
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

  const newCustomer = async (token = full) => {
    const res = await call(app, 'POST', '/v1/customers', {
      token,
      json: { external_id: `c-${randomUUID()}` },
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  describe('health and contract', () => {
    it('reports liveness and database readiness without auth', async () => {
      expect((await call(app, 'GET', '/health/live')).body).toEqual({ ok: true });
      expect((await call(app, 'GET', '/health/ready')).status).toBe(200);
    });

    it('serves the OpenAPI 3.1 document', async () => {
      const res = await call(app, 'GET', '/openapi.json');
      expect(res.body.openapi).toBe('3.1.0');
      expect(Object.keys(res.body.paths)).toContain('/v1/customers/{customer_id}/events');
    });
  });

  describe('authentication', () => {
    it('rejects missing, malformed and unknown keys with 401 and a request id', async () => {
      for (const token of [undefined, 'nope', `bob_0123456789_${'A'.repeat(43)}`]) {
        const res = await call(app, 'GET', '/v1/customers', { token });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('unauthenticated');
        expect(res.body.error.request_id).toBe(res.headers.get('x-request-id'));
      }
    });

    it('rejects revoked and expired keys', async () => {
      const revoked = await issueKey(pools, ws, { capabilities: ['data:read'] });
      await withWorkspace(pools.operator.db, ws, (tx) => revokeApiKey(tx, revoked.keyId));
      const expired = await issueKey(pools, ws, {
        capabilities: ['data:read'],
        expiresAt: new Date(Date.now() - 1000),
      });
      expect((await call(app, 'GET', '/v1/customers', { token: revoked.token })).status).toBe(401);
      expect((await call(app, 'GET', '/v1/customers', { token: expired.token })).status).toBe(401);
    });

    it('returns 403 for a missing capability', async () => {
      const reader = await issueKey(pools, ws, { capabilities: ['data:read'] });
      const customerId = await newCustomer();
      const res = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token: reader.token,
        json: envelope(),
        idempotencyKey: 'k1',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('customers', () => {
    it('creates customers once per external id', async () => {
      const externalId = `c-${randomUUID()}`;
      const created = await call(app, 'POST', '/v1/customers', {
        token: full,
        json: { external_id: externalId },
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        external_id: externalId,
        state: 'active',
        source_revision: 0,
        metadata_job_id: null,
      });
      const again = await call(app, 'POST', '/v1/customers', {
        token: full,
        json: { external_id: externalId },
      });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('customer_exists');
    });

    it('turns creation metadata into a source event and Librarian job', async () => {
      const res = await call(app, 'POST', '/v1/customers', {
        token: full,
        json: { external_id: `c-${randomUUID()}`, metadata: { segment: 'young_family' } },
      });
      expect(res.body.source_revision).toBe(1);
      const job = await call(app, 'GET', `/v1/jobs/${res.body.metadata_job_id}`, { token: full });
      expect(job.body).toMatchObject({ kind: 'librarian', status: 'queued' });
    });

    it('requires a workspace-wide key to create customers', async () => {
      const customerId = await newCustomer();
      const scoped = await issueKey(pools, ws, { capabilities: FULL, customerIds: [customerId] });
      const res = await call(app, 'POST', '/v1/customers', {
        token: scoped.token,
        json: { external_id: 'x' },
      });
      expect(res.status).toBe(403);
    });

    it('paginates with an opaque cursor', async () => {
      const own = await createWorkspace(pools);
      const token = (await issueKey(pools, own, { capabilities: FULL })).token;
      for (let i = 0; i < 3; i++) await newCustomer(token);
      const first = await call(app, 'GET', '/v1/customers?limit=2', { token });
      expect(first.body.items).toHaveLength(2);
      const second = await call(
        app,
        'GET',
        `/v1/customers?limit=2&cursor=${first.body.next_cursor}`,
        { token },
      );
      expect(second.body.items).toHaveLength(1);
      expect(second.body.next_cursor).toBeNull();
    });
  });

  describe('event intake', () => {
    it('accepts a JSON envelope as a queued Librarian job, and never a Proactor job', async () => {
      const customerId = await newCustomer();
      const res = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token: full,
        json: envelope(),
        idempotencyKey: randomUUID(),
      });
      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({ status: 'queued', source_revision: 1 });
      const job = await call(app, 'GET', `/v1/jobs/${res.body.job_id}`, { token: full });
      expect(job.body).toMatchObject({
        kind: 'librarian',
        status: 'queued',
        customer_id: customerId,
      });

      const events = await call(
        app,
        'GET',
        `/v1/customers/${customerId}/events?include_payload=true`,
        { token: full },
      );
      expect(events.body.items).toHaveLength(1);
      expect(events.body.items[0].payload).toEqual(envelope().payload);
    });

    it('wraps text/plain as a note keyed by the idempotency key', async () => {
      const customerId = await newCustomer();
      const key = `note-${randomUUID()}`;
      const res = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token: full,
        text: 'Called about moving boxes.',
        idempotencyKey: key,
      });
      expect(res.status).toBe(202);
      const event = await call(
        app,
        'GET',
        `/v1/customers/${customerId}/events/${res.body.event_id}`,
        { token: full },
      );
      expect(event.body).toMatchObject({
        event_type: 'note',
        source: 'http_text',
        source_event_id: key,
        payload: 'Called about moving boxes.',
      });
    });

    it('replays the same idempotency key and rejects a changed body', async () => {
      const customerId = await newCustomer();
      const key = randomUUID();
      const body = envelope();
      const first = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token: full,
        json: body,
        idempotencyKey: key,
      });
      const replay = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token: full,
        json: body,
        idempotencyKey: key,
      });
      expect(replay.status).toBe(202);
      expect(replay.body).toEqual(first.body);
      const changed = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token: full,
        json: { ...body, payload: { text: 'different' } },
        idempotencyKey: key,
      });
      expect(changed.status).toBe(409);
      expect(changed.body.error.code).toBe('idempotency_conflict');
    });

    it('deduplicates source identity across idempotency keys and rejects changed content', async () => {
      const customerId = await newCustomer();
      const body = envelope();
      const first = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token: full,
        json: body,
        idempotencyKey: randomUUID(),
      });
      const dup = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token: full,
        json: body,
        idempotencyKey: randomUUID(),
      });
      expect(dup.body.event_id).toBe(first.body.event_id);
      expect(dup.body.job_id).toBe(first.body.job_id);
      const conflict = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token: full,
        json: { ...body, payload: { text: 'changed' } },
        idempotencyKey: randomUUID(),
      });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('source_conflict');
    });

    it('enforces the intake boundary', async () => {
      const customerId = await newCustomer();
      const path = `/v1/customers/${customerId}/events`;
      expect((await call(app, 'POST', path, { token: full, json: envelope() })).status).toBe(400);
      const invalid = await call(app, 'POST', path, {
        token: full,
        json: envelope({ workspace_id: randomUUID() }),
        idempotencyKey: randomUUID(),
      });
      expect(invalid.status).toBe(422);
      expect(invalid.body.error.code).toBe('invalid_envelope');
      const binary = await call(app, 'POST', path, {
        token: full,
        text: 'x',
        contentType: 'application/octet-stream',
        idempotencyKey: randomUUID(),
      });
      expect(binary.status).toBe(415);
      const big = await call(app, 'POST', path, {
        token: full,
        text: 'x'.repeat(100 * 1024 + 1),
        idempotencyKey: randomUUID(),
      });
      expect(big.status).toBe(413);
      const huge = await call(app, 'POST', path, {
        token: full,
        json: envelope({ payload: { blob: 'x'.repeat(1024 * 1024) } }),
        idempotencyKey: randomUUID(),
      });
      expect(huge.status).toBe(413);
    });
  });

  describe('isolation', () => {
    it('hides another workspace across every implemented route', async () => {
      const customerId = await newCustomer();
      const accepted = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token: full,
        json: envelope(),
        idempotencyKey: randomUUID(),
      });
      const other = await createWorkspace(pools);
      const intruder = (await issueKey(pools, other, { capabilities: FULL })).token;
      const probes: [string, string, Parameters<typeof call>[3]?][] = [
        ['GET', `/v1/customers/${customerId}`],
        ['GET', `/v1/customers/${customerId}/events`],
        ['GET', `/v1/customers/${customerId}/events/${accepted.body.event_id}`],
        ['GET', `/v1/jobs/${accepted.body.job_id}`],
        [
          'POST',
          `/v1/customers/${customerId}/events`,
          { json: envelope(), idempotencyKey: randomUUID() },
        ],
      ];
      for (const [method, path, opts] of probes) {
        const res = await call(app, method, path, { token: intruder, ...opts });
        expect(res.status, `${method} ${path}`).toBe(404);
      }
      const list = await call(app, 'GET', '/v1/customers', { token: intruder });
      expect(list.body.items).toEqual([]);
    });

    it('limits customer-scoped keys to their grants, including jobs', async () => {
      const own = await createWorkspace(pools);
      const allowed = await createCustomerDirect(pools, own);
      const denied = await createCustomerDirect(pools, own);
      const admin = (await issueKey(pools, own, { capabilities: FULL })).token;
      const scoped = (await issueKey(pools, own, { capabilities: FULL, customerIds: [allowed] }))
        .token;
      const deniedEvent = await call(app, 'POST', `/v1/customers/${denied}/events`, {
        token: admin,
        json: envelope(),
        idempotencyKey: randomUUID(),
      });

      const list = await call(app, 'GET', '/v1/customers', { token: scoped });
      expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([allowed]);
      expect((await call(app, 'GET', `/v1/customers/${allowed}`, { token: scoped })).status).toBe(
        200,
      );
      expect((await call(app, 'GET', `/v1/customers/${denied}`, { token: scoped })).status).toBe(
        404,
      );
      expect(
        (await call(app, 'GET', `/v1/jobs/${deniedEvent.body.job_id}`, { token: scoped })).status,
      ).toBe(404);
    });

    it('hides jobs from keys without the originating capability', async () => {
      const customerId = await newCustomer();
      const accepted = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token: full,
        json: envelope(),
        idempotencyKey: randomUUID(),
      });
      const reader = (await issueKey(pools, ws, { capabilities: ['data:read'] })).token;
      expect(
        (await call(app, 'GET', `/v1/jobs/${accepted.body.job_id}`, { token: reader })).status,
      ).toBe(404);
    });
  });

  describe('admission', () => {
    it('applies the shared per-key window and answers 429 with Retry-After', async () => {
      const own = await createWorkspace(pools);
      const token = (await issueKey(pools, own, { capabilities: FULL })).token;
      const limited = apiApp(pools, { mutation: 100, read: 2, model: 100 });
      const statuses = [];
      for (let i = 0; i < 3; i++)
        statuses.push((await call(limited, 'GET', '/v1/customers', { token })).status);
      // A second app instance shares the SQL window, as another replica would.
      const replica = apiApp(pools, { mutation: 100, read: 2, model: 100 });
      const res = await call(replica, 'GET', '/v1/customers', { token });
      expect(statuses).toEqual([200, 200, 429]);
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBeTruthy();
    });
  });
});
