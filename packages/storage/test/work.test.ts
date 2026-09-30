import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withWorkspace } from '../src/db.js';
import { insertCustomer } from '../src/repositories/customers.js';
import { type AppendSourceInput, appendSourceEvent } from '../src/repositories/intake.js';
import {
  claimJob,
  claimOutbox,
  completeJob,
  failJob,
  markOutboxDispatched,
  reconcileJobs,
} from '../src/repositories/jobs.js';
import { jobs, outbox } from '../src/schema/index.js';
import { closePools, dbAvailable, openPools, type Pools, seedWorkspace } from './fixtures.js';

describe.skipIf(!dbAvailable())('intake, jobs and outbox', () => {
  let pools: Pools;
  let ws: Awaited<ReturnType<typeof seedWorkspace>>;

  const event = (overrides: Partial<AppendSourceInput> = {}): AppendSourceInput => ({
    workspaceId: ws.workspaceId,
    customerId: ws.customerId,
    source: 'bank_demo',
    sourceEventId: randomUUID(),
    eventType: 'note',
    occurredAt: new Date('2026-10-01T08:00:00Z'),
    payload: { text: 'I am moving on 20 October.' },
    payloadHash: 'hash-a',
    ...overrides,
  });
  const inWs = <T>(fn: Parameters<typeof withWorkspace<T>>[2]) =>
    withWorkspace(pools.api.db, ws.workspaceId, fn);

  beforeAll(async () => {
    pools = openPools();
    ws = await seedWorkspace(pools);
  });
  afterAll(() => closePools(pools));

  it('allocates monotonic sequences and one librarian job + outbox row per source', async () => {
    const first = await inWs((tx) => appendSourceEvent(tx, event()));
    const second = await inWs((tx) => appendSourceEvent(tx, event()));
    expect(first.status).toBe('accepted');
    expect(second.status).toBe('accepted');
    if (first.status !== 'accepted' || second.status !== 'accepted') return;
    expect(second.sourceRevision).toBe(first.sourceRevision + 1);

    const rows = await inWs((tx) =>
      tx
        .select()
        .from(outbox)
        .innerJoin(jobs, eq(jobs.id, outbox.jobId))
        .where(eq(jobs.id, first.jobId)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      jobs: { kind: 'librarian' },
      outbox: { queue: 'memory', generation: 1 },
    });
  });

  it('never enqueues the Proactor from ingestion', async () => {
    await inWs((tx) => appendSourceEvent(tx, event()));
    const proactor = await inWs((tx) => tx.select().from(jobs).where(eq(jobs.kind, 'proactor')));
    expect(proactor).toEqual([]);
  });

  it('deduplicates the same source identity and rejects changed content', async () => {
    const input = event();
    const original = await inWs((tx) => appendSourceEvent(tx, input));
    const replay = await inWs((tx) => appendSourceEvent(tx, input));
    const changed = await inWs((tx) => appendSourceEvent(tx, { ...input, payloadHash: 'hash-b' }));
    expect(replay.status).toBe('duplicate');
    if (original.status !== 'accepted' || replay.status !== 'duplicate') return;
    expect(replay.jobId).toBe(original.jobId);
    expect(replay.event.id).toBe(original.event.id);
    expect(changed.status).toBe('identity_conflict');
  });

  it('only accepts correction targets from the same customer', async () => {
    const other = await inWs((tx) =>
      insertCustomer(tx, { workspaceId: ws.workspaceId, externalId: `other-${randomUUID()}` }),
    );
    if (!other) throw new Error('setup failed');
    const foreign = await inWs((tx) => appendSourceEvent(tx, event({ customerId: other.id })));
    if (foreign.status !== 'accepted') throw new Error('setup failed');
    const result = await inWs((tx) =>
      appendSourceEvent(tx, event({ eventType: 'correction', correctsEventId: foreign.event.id })),
    );
    expect(result.status).toBe('correction_target_missing');
  });

  it('fences stale workers out of result commits', async () => {
    const accepted = await inWs((tx) => appendSourceEvent(tx, event()));
    if (accepted.status !== 'accepted') throw new Error('setup failed');
    const worker = (fn: Parameters<typeof withWorkspace>[2]) =>
      withWorkspace(pools.worker.db, ws.workspaceId, fn);

    const claimed = await worker((tx) => claimJob(tx, accepted.jobId, 60));
    expect(claimed).toMatchObject({ status: 'running', attempts: 1 });
    // A duplicate delivery while leased claims nothing.
    expect(await worker((tx) => claimJob(tx, accepted.jobId, 60))).toBeUndefined();

    const token = (claimed as { leaseToken: number }).leaseToken;
    expect(await worker((tx) => completeJob(tx, accepted.jobId, token - 1, { ok: true }))).toBe(
      false,
    );
    expect(await worker((tx) => completeJob(tx, accepted.jobId, token, { ok: true }))).toBe(true);
    expect(await worker((tx) => completeJob(tx, accepted.jobId, token, { ok: true }))).toBe(false);
  });

  it('retries transient failures through a new outbox generation, then fails terminally', async () => {
    const accepted = await inWs((tx) => appendSourceEvent(tx, event()));
    if (accepted.status !== 'accepted') throw new Error('setup failed');
    const worker = <T>(fn: Parameters<typeof withWorkspace<T>>[2]) =>
      withWorkspace(pools.worker.db, ws.workspaceId, fn);
    const failure = {
      code: 'provider_timeout',
      message: 'timeout',
      retryable: true,
      backoffSeconds: 0,
    };

    const outcomes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const claimed = await worker((tx) => claimJob(tx, accepted.jobId, 60));
      if (!claimed) throw new Error(`attempt ${i + 1} not claimable`);
      outcomes.push(await worker((tx) => failJob(tx, accepted.jobId, claimed.leaseToken, failure)));
    }
    expect(outcomes).toEqual(['retry_wait', 'retry_wait', 'failed']);
    const generations = await worker((tx) =>
      tx.select({ g: outbox.generation }).from(outbox).where(eq(outbox.jobId, accepted.jobId)),
    );
    expect(generations.map((r) => r.g).sort()).toEqual([1, 2, 3]);
  });

  it('claims outbox rows across workspaces once, and recovers expired leases', async () => {
    const other = await seedWorkspace(pools, 'other');
    const inOther = await withWorkspace(pools.api.db, other.workspaceId, (tx) =>
      appendSourceEvent(tx, {
        ...event(),
        workspaceId: other.workspaceId,
        customerId: other.customerId,
      }),
    );
    if (inOther.status !== 'accepted') throw new Error('setup failed');

    const claimed = await claimOutbox(pools.worker.db, ['librarian'], 100, 60);
    const mine = claimed.find((c) => c.jobId === inOther.jobId);
    expect(mine).toMatchObject({
      workspaceId: other.workspaceId,
      kind: 'librarian',
      generation: 1,
    });
    // Claimed rows are not handed out again while their claim is fresh.
    const again = await claimOutbox(pools.worker.db, ['librarian'], 100, 60);
    expect(again.find((c) => c.jobId === inOther.jobId)).toBeUndefined();
    if (!mine) throw new Error('claim missing');
    await markOutboxDispatched(pools.worker.db, mine.outboxId, `job-${inOther.jobId}-1`);

    // Simulate a worker that claimed the job and died: lease already expired.
    await withWorkspace(pools.worker.db, other.workspaceId, async (tx) => {
      await claimJob(tx, inOther.jobId, 60);
      await tx
        .update(jobs)
        .set({ leaseUntil: sql`now() - interval '1 second'` })
        .where(eq(jobs.id, inOther.jobId));
    });
    const reconciled = await reconcileJobs(pools.worker.db, {
      limit: 100,
      lostDispatchSeconds: 600,
    });
    expect(reconciled.expiredLeases).toBeGreaterThanOrEqual(1);
    const regenerated = await claimOutbox(pools.worker.db, ['librarian'], 100, 60);
    expect(regenerated.find((c) => c.jobId === inOther.jobId)).toMatchObject({ generation: 2 });
  });
});
