import { randomUUID } from 'node:crypto';
import {
  BRAIN_TREE,
  DocumentPath,
  type EvidenceSource,
  type MemoryPatch,
  type StructuredMemory,
} from '@bob/contracts';
import { commitBrainSnapshot, getBrainSnapshot, getJob, schema, withWorkspace } from '@bob/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLibrarianHandlers } from '../src/modules/librarian/handlers.js';
import { applyPatch, emptyMemory, signatureOf } from '../src/modules/librarian/memory.js';
import {
  ModelCallError,
  type ModelClient,
  type ModelRequest,
} from '../src/modules/librarian/model.js';
import { renderDocuments } from '../src/modules/librarian/render.js';
import { runJob } from '../src/worker/runner.js';
import {
  apiApp,
  call,
  closePools,
  createWorkspace,
  dbAvailable,
  envelope,
  FULL,
  issueKey,
  openPools,
  type Pools,
} from './helpers.js';

const NOW = '2026-10-01T09:00:00Z';

const source = (sequence: number, overrides: Partial<EvidenceSource> = {}): EvidenceSource => ({
  event_id: randomUUID(),
  sequence,
  event_type: 'note',
  source: 'bank_demo',
  occurred_at: '2026-10-01T08:00:00Z',
  received_at: '2026-10-01T08:00:01Z',
  corrects_event_id: null,
  ...overrides,
});

const MOVE_PATCH: MemoryPatch = {
  summary: 'Preparing to move to Antwerp for a new job; timing and budget are open.',
  operations: [
    {
      op: 'add',
      key: 'job',
      kind: 'transition',
      area: 'work',
      statement: 'Starting a job in Antwerp',
      status: 'customer_confirmed',
      evidence: [1],
      tag: 'starting_new_job',
      valid_from: '2026-11-01',
      reason: 'Customer said so',
    },
    {
      op: 'add',
      key: 'move',
      kind: 'goal',
      area: 'home',
      statement: 'Relocate to Antwerp before December',
      status: 'customer_confirmed',
      evidence: [1],
      target_date: '2026-12-01',
      related: ['job'],
      reason: 'Customer wants to move',
    },
    {
      op: 'add',
      kind: 'preference',
      area: 'banking',
      statement: 'Prefers comparing options independently',
      context: 'choosing financial products',
      status: 'inferred',
      evidence: [1],
      tag: 'prefers_self_service',
      reason: 'Asked for a list rather than a call',
    },
  ],
};

function applied(memory: StructuredMemory, patch: MemoryPatch, batch: EvidenceSource[]) {
  const result = applyPatch(memory, patch, batch, NOW);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.memory;
}

describe('memory patches', () => {
  it('assigns category IDs, resolves keys and applies review defaults', () => {
    const memory = applied(emptyMemory(), MOVE_PATCH, [source(1)]);
    expect(memory.assertions.map((a) => a.id)).toEqual(['g_002', 'p_003', 's_001']);
    const goal = memory.assertions.find((a) => a.id === 'g_002');
    expect(goal).toMatchObject({ goal_state: 'open', related_ids: ['s_001'] });
    // A goal reviews at its target date; an inferred preference after 180 days.
    expect(goal?.review_after).toBe('2026-12-01');
    expect(memory.assertions.find((a) => a.id === 'p_003')?.review_after).toBe('2027-03-30');
    expect(memory.next_id).toBe(4);
    expect(memory.evidence).toHaveLength(1);
    expect(signatureOf(memory)).toEqual({
      personality: ['prefers_self_service'],
      situation: ['starting_new_job'],
    });
  });

  it('reports every invalid operation for one repair round', () => {
    const result = applyPatch(
      emptyMemory(),
      {
        operations: [
          {
            op: 'add',
            kind: 'goal',
            area: 'home',
            statement: 'x',
            status: 'observed',
            evidence: [7],
            reason: 'r',
          },
          {
            op: 'add',
            kind: 'value',
            area: 'home',
            statement: 'x',
            status: 'observed',
            evidence: [1],
            tag: 'renting',
            reason: 'r',
          },
          {
            op: 'add',
            kind: 'life_event',
            area: 'home',
            statement: 'x',
            status: 'observed',
            evidence: [1],
            goal_state: 'open',
            reason: 'r',
          },
          { op: 'update', id: 's_404', evidence: [1], reason: 'r' },
          {
            op: 'add',
            kind: 'goal',
            area: 'home',
            statement: 'x',
            status: 'observed',
            evidence: [1],
            target_date: 'soon',
            reason: 'r',
          },
        ],
      },
      [source(1)],
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/#7 is not a source/);
    expect(result.errors.join('\n')).toMatch(/tag "renting" is not in the personality vocabulary/);
    expect(result.errors.join('\n')).toMatch(/goal_state\/target_date only apply/);
    expect(result.errors.join('\n')).toMatch(/unknown assertion id "s_404"/);
    expect(result.errors.join('\n')).toMatch(/target_date must be a YYYY-MM-DD date/);
  });

  it('requires new evidence and keeps retired history out of the signature', () => {
    const first = applied(emptyMemory(), MOVE_PATCH, [source(1)]);
    const stale = applyPatch(
      first,
      { operations: [{ op: 'retire', id: 's_001', evidence: [1], reason: 'r' }] },
      [source(2)],
      NOW,
    );
    expect(stale.ok).toBe(false);

    const second = applied(
      first,
      {
        operations: [
          { op: 'retire', id: 's_001', evidence: [2], reason: 'Job started; transition complete' },
          { op: 'update', id: 'g_002', goal_state: 'achieved', evidence: [2], reason: 'Moved' },
          {
            op: 'add',
            kind: 'life_event',
            area: 'home',
            statement: 'Moved to Antwerp',
            status: 'customer_confirmed',
            evidence: [2],
            valid_from: '2026-11-20',
            reason: 'Confirmed',
          },
        ],
      },
      [source(2)],
    );
    const retired = second.assertions.find((a) => a.id === 's_001');
    expect(retired).toMatchObject({
      status: 'retired',
      retired_reason: 'Job started; transition complete',
    });
    expect(retired?.evidence.map((r) => r.sequence)).toEqual([1, 2]);
    expect(signatureOf(second).situation).toEqual([]);
    expect(second.assertions.find((a) => a.id === 'g_002')?.goal_state).toBe('achieved');

    const docs = renderDocuments(second, { version: 3, sourceWatermark: 2, asOf: NOW });
    expect(docs['situation/current.md']).toContain('## Previously true');
    expect(docs['situation/current.md']).toContain('~~Starting a job in Antwerp~~');
    expect(docs['experience/history.md']).toContain('### Moved to Antwerp');
    expect(docs['overview.md']).not.toContain('Relocate to Antwerp before December (g_002');
  });
});

describe('rendering', () => {
  it('renders the full tree deterministically, with an empty skeleton', () => {
    const meta = { version: 1, sourceWatermark: 0, asOf: NOW };
    const empty = renderDocuments(emptyMemory(), meta);
    expect(Object.keys(empty).sort()).toEqual([...DocumentPath.options].sort());
    expect(BRAIN_TREE.flatMap((f) => f.documents)).toHaveLength(DocumentPath.options.length);
    for (const path of DocumentPath.options) expect(empty[path]).toMatch(/^# /);
    expect(empty['situation/current.md']).toContain('_Nothing recorded yet._');

    const memory = applied(emptyMemory(), MOVE_PATCH, [source(1)]);
    const once = renderDocuments(memory, meta);
    expect(renderDocuments(structuredClone(memory), meta)).toEqual(once);
    expect(once['situation/goals.md']).toContain('- Related: s_001');
    expect(once['personality/preferences.md']).toContain('- Context: choosing financial products');
    expect(once['overview.md']).toContain('[situation/goals.md](situation/goals.md)');
    expect(once['evidence/sources.md']).toContain('| 1 | note | bank_demo |');
  });

  it('keeps supplied text from forming Markdown structure', () => {
    const memory = applied(
      emptyMemory(),
      {
        operations: [
          {
            op: 'add',
            kind: 'circumstance',
            area: 'home',
            statement: 'Lives <b>here</b>\n## Injected | x',
            status: 'observed',
            evidence: [1],
            reason: 'r',
          },
        ],
      },
      [source(1)],
    );
    const doc = renderDocuments(memory, { version: 2, sourceWatermark: 1, asOf: NOW })[
      'situation/current.md'
    ];
    expect(doc).toContain('### Lives &lt;b&gt;here&lt;/b&gt; ## Injected \\| x');
    expect(doc).not.toMatch(/^## Injected/m);
  });

  it('flags review items that are due as of the snapshot', () => {
    const memory = applied(emptyMemory(), MOVE_PATCH, [source(1)]);
    const later = renderDocuments(memory, {
      version: 2,
      sourceWatermark: 1,
      asOf: '2026-12-02T00:00:00Z',
    });
    expect(later['situation/goals.md']).toContain('- Review after: 2026-12-01 (due)');
    expect(later['overview.md']).toContain('- g_002: Relocate to Antwerp before December');
  });
});

/** Scripted model: returns queued outputs in order and records every request it saw. */
class FakeModel implements ModelClient {
  readonly model = 'fake-model';
  readonly requests: ModelRequest<never>[] = [];
  constructor(private readonly outputs: (unknown | ((req: ModelRequest<never>) => unknown))[]) {}
  async generateJson(request: ModelRequest<never>) {
    this.requests.push(request);
    const next = this.outputs.shift();
    if (next === undefined) throw new Error('FakeModel exhausted');
    const value = typeof next === 'function' ? await next(request) : next;
    if (value instanceof Error) throw value;
    return { value, usage: { inputTokens: 100, outputTokens: 20, durationMs: 5 } };
  }
}

describe.skipIf(!dbAvailable())('librarian jobs', () => {
  let pools: Pools;
  beforeAll(() => {
    pools = openPools();
  });
  afterAll(() => closePools(pools));

  async function setup() {
    const app = apiApp(pools);
    const workspaceId = await createWorkspace(pools);
    const { token } = await issueKey(pools, workspaceId, { capabilities: FULL });
    const created = await call(app, 'POST', '/v1/customers', {
      token,
      json: { external_id: `c-${randomUUID()}` },
    });
    expect(created.status).toBe(201);
    const customerId = created.body.id as string;
    const send = async (text: string, overrides: Record<string, unknown> = {}) => {
      const res = await call(app, 'POST', `/v1/customers/${customerId}/events`, {
        token,
        json: envelope({ payload: { text }, ...overrides }),
        idempotencyKey: randomUUID(),
      });
      expect(res.status).toBe(202);
      return res.body as { event_id: string; job_id: string };
    };
    const run = (model: FakeModel, kind: 'librarian' | 'query', jobId: string) =>
      runJob(
        {
          db: pools.worker.db,
          handlers: createLibrarianHandlers({
            librarianModel: model,
            queryModel: model,
            now: () => new Date(NOW),
          }),
        },
        kind,
        { workspaceId, jobId },
      );
    const job = (jobId: string) =>
      withWorkspace(pools.worker.db, workspaceId, (tx) => getJob(tx, jobId));
    const brain = () =>
      withWorkspace(pools.worker.db, workspaceId, (tx) => getBrainSnapshot(tx, customerId));
    const modelRuns = (jobId: string) =>
      withWorkspace(pools.worker.db, workspaceId, (tx) =>
        tx.select().from(schema.modelRuns).where(eq(schema.modelRuns.jobId, jobId)),
      );
    return { app, token, workspaceId, customerId, send, run, job, brain, modelRuns };
  }

  it('turns a note into a new brain version with evidence, documents and a result', async () => {
    const s = await setup();
    const { event_id, job_id } = await s.send(
      'I start a job in Antwerp and want to move before December. Ref ZX-81.',
    );
    const model = new FakeModel([MOVE_PATCH]);

    expect(await s.run(model, 'librarian', job_id)).toBe('succeeded');
    const brain = await s.brain();
    expect(brain).toMatchObject({
      version: 2,
      baseVersion: 1,
      sourceWatermark: 1,
      modelVersion: 'fake-model',
    });
    const documents = brain?.documents as Record<string, string>;
    expect(documents['situation/goals.md']).toContain('### Relocate to Antwerp before December');
    expect(documents['evidence/sources.md']).toContain(event_id);
    expect(brain?.signature).toEqual({
      personality: ['prefers_self_service'],
      situation: ['starting_new_job'],
    });

    expect((await s.job(job_id))?.result).toEqual({
      brain_version: 2,
      source_watermark: 1,
      incorporated_event_ids: [event_id],
      operations: { added: 3, updated: 0, retired: 0 },
      has_pending_sources: false,
      already_incorporated: false,
    });
    expect(await s.modelRuns(job_id)).toMatchObject([
      { role: 'librarian', outcome: 'succeeded', inputTokens: 100 },
    ]);

    // Customer content is only ever in the user turn, inside the untrusted-data delimiter.
    const request = model.requests[0];
    expect(request?.system).not.toContain('ZX-81');
    expect(request?.user).toMatch(/<new_sources[^>]*>[\s\S]*ZX-81[\s\S]*<\/new_sources>/);

    const read = await call(s.app, 'GET', `/v1/customers/${s.customerId}/brain`, {
      token: s.token,
    });
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ version: 2, has_pending_sources: false });
  });

  it('batches pending sources and marks later jobs as already incorporated', async () => {
    const s = await setup();
    const first = await s.send('Renting in Brussels.');
    const second = await s.send('Budget for the move is tight.');
    const model = new FakeModel([
      {
        operations: [
          {
            op: 'add',
            kind: 'circumstance',
            area: 'home',
            statement: 'Renting in Brussels',
            status: 'customer_confirmed',
            evidence: [1],
            tag: 'renting',
            reason: 'stated',
          },
          {
            op: 'add',
            kind: 'constraint',
            area: 'finances',
            statement: 'Moving budget is tight',
            status: 'customer_confirmed',
            evidence: [2],
            reason: 'stated',
          },
        ],
      },
    ]);
    expect(await s.run(model, 'librarian', first.job_id)).toBe('succeeded');
    expect(await s.run(model, 'librarian', second.job_id)).toBe('succeeded');
    expect(model.requests).toHaveLength(1);
    expect((await s.brain())?.sourceWatermark).toBe(2);
    expect((await s.job(second.job_id))?.result).toMatchObject({
      brain_version: 2,
      already_incorporated: true,
    });
  });

  it('repairs one invalid patch, and fails without touching the brain after two', async () => {
    const s = await setup();
    const bad = {
      operations: [
        {
          op: 'add',
          kind: 'goal',
          area: 'home',
          statement: 'x',
          status: 'observed',
          evidence: [99],
          reason: 'r',
        },
      ],
    };
    const good = {
      operations: [
        {
          op: 'add',
          kind: 'goal',
          area: 'home',
          statement: 'Buy a flat',
          status: 'customer_confirmed',
          evidence: [1],
          reason: 'stated',
        },
      ],
    };

    const repaired = await s.send('I want to buy a flat.');
    const model = new FakeModel([bad, good]);
    expect(await s.run(model, 'librarian', repaired.job_id)).toBe('succeeded');
    expect(model.requests[1]?.user).toContain('evidence #99 is not a source of this customer');
    expect((await s.modelRuns(repaired.job_id)).map((r) => r.outcome).sort()).toEqual([
      'invalid_output',
      'succeeded',
    ]);

    const s2 = await setup();
    const failing = await s2.send('Something.');
    expect(
      await s2.run(new FakeModel([bad, { nonsense: true }]), 'librarian', failing.job_id),
    ).toBe('failed');
    expect(await s2.job(failing.job_id)).toMatchObject({
      status: 'failed',
      errorCode: 'invalid_model_output',
    });
    expect((await s2.brain())?.version).toBe(1);
    expect(await s2.modelRuns(failing.job_id)).toHaveLength(2);
  });

  it('retries provider failures and brain races instead of committing stale work', async () => {
    const s = await setup();
    const { job_id } = await s.send('Hello.');
    const outage = new FakeModel([new ModelCallError('provider_error', 'status 503', true)]);
    expect(await s.run(outage, 'librarian', job_id)).toBe('retry_wait');
    expect(await s.job(job_id)).toMatchObject({ errorCode: 'model_provider_error' });

    // A concurrent writer advances the brain while the model is "thinking".
    const s2 = await setup();
    const raced = await s2.send('Hello again.');
    const racing = new FakeModel([
      async () => {
        const base = await s2.brain();
        await withWorkspace(pools.worker.db, s2.workspaceId, (tx) =>
          commitBrainSnapshot(tx, {
            ...(base as NonNullable<typeof base>),
            version: 2,
            baseVersion: 1,
          }),
        );
        return { operations: [] };
      },
    ]);
    expect(await s2.run(racing, 'librarian', raced.job_id)).toBe('retry_wait');
    expect(await s2.job(raced.job_id)).toMatchObject({ errorCode: 'brain_conflict' });
    expect((await s2.brain())?.sourceWatermark).toBe(0);
  });

  it('applies a correction by updating the corrected assertion', async () => {
    const s = await setup();
    const original = await s.send('We are moving house.');
    await s.run(
      new FakeModel([
        {
          operations: [
            {
              op: 'add',
              kind: 'goal',
              area: 'home',
              statement: 'Move house',
              status: 'customer_confirmed',
              evidence: [1],
              reason: 'stated',
            },
          ],
        },
      ]),
      'librarian',
      original.job_id,
    );
    const correction = await s.send('Correction: we are renovating, not moving.', {
      event_type: 'correction',
      corrects_event_id: original.event_id,
    });
    const model = new FakeModel([
      {
        operations: [
          {
            op: 'update',
            id: 'g_001',
            statement: 'Renovate the current home',
            status: 'corrected',
            evidence: [2],
            reason: 'Customer corrected #1',
          },
        ],
      },
    ]);
    expect(await s.run(model, 'librarian', correction.job_id)).toBe('succeeded');
    expect(model.requests[0]?.user).toContain('"corrects_sequence":1');
    const goal = ((await s.brain())?.structured as StructuredMemory | undefined)?.assertions[0];
    expect(goal).toMatchObject({ statement: 'Renovate the current home', status: 'corrected' });
    expect(goal?.evidence.map((r) => r.sequence)).toEqual([1, 2]);
  });

  it('answers a question from the captured brain without changing it', async () => {
    const s = await setup();
    const { job_id } = await s.send('I start a job in Antwerp and want to move before December.');
    await s.run(new FakeModel([MOVE_PATCH]), 'librarian', job_id);
    await s.send('A newer note that is not processed yet.');

    const submitted = await call(s.app, 'POST', `/v1/customers/${s.customerId}/query`, {
      token: s.token,
      json: { question: 'What moving help might this customer need?' },
      idempotencyKey: randomUUID(),
    });
    expect(submitted.status).toBe(202);
    const model = new FakeModel([
      {
        answer: 'They plan to relocate to Antwerp before December for a new job.',
        answerable: true,
        assertion_ids: ['g_002', 's_001', 'z_999'],
        evidence: [1, 42],
        uncertainties: ['Budget is unknown.'],
      },
    ]);
    expect(await s.run(model, 'query', submitted.body.job_id)).toBe('succeeded');
    expect(model.requests[0]?.user).toContain('<!-- file: situation/goals.md -->');
    expect(model.requests[0]?.user).toContain('What moving help might this customer need?');

    const result = await call(s.app, 'GET', `/v1/jobs/${submitted.body.job_id}`, {
      token: s.token,
    });
    expect(result.body.result).toMatchObject({
      answerable: true,
      brain_version: 2,
      has_pending_sources: true,
      cited_assertion_ids: ['g_002', 's_001'],
      uncertainties: [
        'Budget is unknown.',
        'Some citations did not match this memory and were removed.',
        'Newer sources are not yet incorporated into this memory version.',
      ],
    });
    expect(result.body.result.evidence_event_ids).toHaveLength(1);
    expect((await s.brain())?.version).toBe(2);
    expect(await s.modelRuns(submitted.body.job_id)).toMatchObject([{ role: 'librarian_query' }]);
  });
});
