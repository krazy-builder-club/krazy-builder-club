import {
  type EvidenceSource,
  type LibrarianResult,
  MEMORY_SCHEMA_VERSION,
  MemoryPatch,
  QueryModelOutput,
  type QueryResult,
  StructuredMemory,
} from '@bob/contracts';
import {
  type BrainSnapshotRow,
  commitBrainSnapshot,
  countSourcesAfter,
  getBrainSnapshot,
  getCustomer,
  getSourceEvent,
  listSourceEventsAfter,
  recordModelRun,
  type SourceEventRow,
  type Tx,
} from '@bob/storage';
import { z } from 'zod';
import { type HandlerRegistry, type JobContext, JobError } from '../../worker/runner.js';
import { applyPatch, emptyMemory, signatureOf } from './memory.js';
import {
  ModelCallError,
  type ModelClient,
  type ModelRequest,
  type ModelResponse,
  type ModelRole,
} from './model.js';
import {
  LIBRARIAN_PROMPT_VERSION,
  LIBRARIAN_SYSTEM,
  librarianUserTurn,
  type PromptSource,
  QUERY_PROMPT_VERSION,
  QUERY_SYSTEM,
  queryUserTurn,
  repairTurn,
} from './prompts.js';
import { bundleDocuments, renderDocuments } from './render.js';

/** Batch bounds per Librarian job; remaining sources are picked up by their own jobs. */
export const LIBRARIAN_BATCH = { maxEvents: 25, maxContentBytes: 120 * 1024 } as const;
const LIBRARIAN_MAX_OUTPUT_TOKENS = 8192;
const QUERY_MAX_OUTPUT_TOKENS = 2048;
const WORKSPACE_WIDE = { allCustomers: true } as const;

export type LibrarianDeps = {
  librarianModel: ModelClient;
  queryModel: ModelClient;
  now?: () => Date;
};

export function createLibrarianHandlers(deps: LibrarianDeps): HandlerRegistry {
  return {
    librarian: (ctx) => runLibrarian(deps, ctx),
    query: (ctx) => runQuery(deps, ctx),
  };
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

function customerOf(ctx: JobContext) {
  if (!ctx.job.customerId) throw new JobError('invalid_job', 'Job has no customer', false);
  return ctx.job.customerId;
}

function readMemory(snapshot: BrainSnapshotRow | undefined) {
  if (!snapshot) return emptyMemory();
  const parsed = StructuredMemory.safeParse(snapshot.structured);
  if (!parsed.success) {
    throw new JobError(
      'unsupported_memory_schema',
      'Stored memory has an unsupported schema',
      false,
    );
  }
  return parsed.data;
}

function sourceContent(event: SourceEventRow): unknown {
  if (event.payloadText !== null) return event.payloadText;
  if (event.fileId !== null) return { attachment: 'file content not extracted yet' };
  return event.payload;
}

/**
 * Takes events in sequence order up to the batch bounds. Always takes the first, so one large
 * event still progresses (request limits already bound it); later ones wait for their own job.
 */
function boundBatch(events: SourceEventRow[]) {
  const batch: SourceEventRow[] = [];
  let bytes = 0;
  for (const event of events) {
    const size = Buffer.byteLength(JSON.stringify(sourceContent(event)) ?? '', 'utf8');
    if (batch.length > 0 && bytes + size > LIBRARIAN_BATCH.maxContentBytes) break;
    batch.push(event);
    bytes += size;
  }
  return batch;
}

type Attempt = { outcome: string; usage?: ModelResponse['usage'] };

/**
 * Calls the model, validates, and allows exactly one repair round with the validation errors.
 * `check` returns problems for output that parsed but is not acceptable. Every call is recorded.
 */
async function callWithRepair<T extends z.ZodType, R>(
  ctx: JobContext,
  model: ModelClient,
  request: Omit<ModelRequest<T>, 'signal'>,
  check: (value: z.infer<T>) => { ok: true; value: R } | { ok: false; errors: string[] },
): Promise<{ value: R; attempts: Attempt[] }> {
  const attempts: Attempt[] = [];
  let user = request.user;
  for (let round = 0; round < 2; round++) {
    let response: ModelResponse;
    try {
      response = await model.generateJson({ ...request, user, signal: ctx.signal });
    } catch (error) {
      if (error instanceof ModelCallError) {
        attempts.push({ outcome: error.outcome, usage: error.usage });
        throw Object.assign(
          new JobError(`model_${error.outcome}`, 'Model call failed', error.retryable, 30),
          { attempts },
        );
      }
      attempts.push({ outcome: ctx.signal.aborted ? 'timeout' : 'provider_error' });
      throw Object.assign(new JobError('model_provider_error', 'Model call failed', true, 30), {
        attempts,
      });
    }
    const parsed = request.schema.safeParse(response.value);
    const checked = parsed.success
      ? check(parsed.data)
      : {
          ok: false as const,
          errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
        };
    if (checked.ok) {
      attempts.push({ outcome: 'succeeded', usage: response.usage });
      return { value: checked.value, attempts };
    }
    attempts.push({ outcome: 'invalid_output', usage: response.usage });
    user = `${request.user}\n\n<previous_output>\n${JSON.stringify(response.value)}\n</previous_output>\n\n${repairTurn(checked.errors)}`;
  }
  throw Object.assign(
    new JobError('invalid_model_output', 'Model output failed validation after repair', false),
    { attempts },
  );
}

async function recordAttempts(
  tx: Tx,
  ctx: JobContext,
  run: { role: ModelRole; model: string; promptVersion: string; inputRevisions: unknown },
  attempts: Attempt[],
) {
  for (const attempt of attempts) {
    await recordModelRun(tx, {
      workspaceId: ctx.job.workspaceId,
      customerId: ctx.job.customerId,
      jobId: ctx.job.id,
      role: run.role,
      model: run.model,
      promptVersion: run.promptVersion,
      schemaVersion: String(MEMORY_SCHEMA_VERSION),
      inputRevisions: run.inputRevisions,
      providerRequestId: attempt.usage?.providerRequestId,
      durationMs: attempt.usage?.durationMs,
      inputTokens: attempt.usage?.inputTokens,
      outputTokens: attempt.usage?.outputTokens,
      outcome: attempt.outcome,
    });
  }
}

/** Records failed attempts in their own transaction, then rethrows for the runner. */
async function failWithAttempts(
  ctx: JobContext,
  run: Parameters<typeof recordAttempts>[2],
  error: unknown,
): Promise<never> {
  const attempts = (error as { attempts?: Attempt[] }).attempts;
  if (attempts?.length) await ctx.transaction((tx) => recordAttempts(tx, ctx, run, attempts));
  throw error;
}

const LibrarianInput = z.object({ event_id: z.uuid() });

/**
 * Incorporates unprocessed sources into the customer's memory: load (short transaction) ->
 * model patch (no transaction) -> deterministic validate/apply/render -> fenced commit that
 * only succeeds if the brain is still at the version the patch was built on.
 */
async function runLibrarian(deps: LibrarianDeps, ctx: JobContext) {
  const customerId = customerOf(ctx);
  const input = LibrarianInput.safeParse(ctx.job.input);
  if (!input.success) throw new JobError('invalid_job', 'Librarian job input is invalid', false);
  const now = iso(deps.now?.() ?? new Date());

  const loaded = await ctx.transaction(async (tx) => {
    const customer = await getCustomer(tx, WORKSPACE_WIDE, customerId);
    if (!customer) return undefined;
    const snapshot = await getBrainSnapshot(tx, customerId);
    const target = await getSourceEvent(tx, customerId, input.data.event_id);
    const watermark = snapshot?.sourceWatermark ?? 0;
    const events = await listSourceEventsAfter(
      tx,
      customerId,
      watermark,
      LIBRARIAN_BATCH.maxEvents,
    );
    return { snapshot, target, watermark, events };
  });
  if (!loaded) throw new JobError('customer_unavailable', 'Customer is not active', false);
  if (!loaded.target) throw new JobError('invalid_job', 'Source event not found', false);
  const { snapshot, watermark } = loaded;

  if (loaded.target.sequence <= watermark || loaded.events.length === 0) {
    const result: LibrarianResult = {
      brain_version: snapshot?.version ?? 0,
      source_watermark: watermark,
      incorporated_event_ids: [],
      operations: { added: 0, updated: 0, retired: 0 },
      has_pending_sources: false,
      already_incorporated: true,
    };
    await ctx.commit(
      (tx) => countSourcesAfter(tx, customerId, watermark),
      (pending) => ({ ...result, has_pending_sources: pending > 0 }),
    );
    return;
  }

  const memory = readMemory(snapshot);
  const batch = boundBatch(loaded.events);
  const sequenceOf = new Map(
    [...memory.evidence, ...batch.map((e) => ({ event_id: e.id, sequence: e.sequence }))].map(
      (e) => [e.event_id, e.sequence],
    ),
  );
  const sources: EvidenceSource[] = batch.map((e) => ({
    event_id: e.id,
    sequence: e.sequence,
    event_type: e.eventType,
    source: e.source,
    occurred_at: iso(e.occurredAt),
    received_at: iso(e.receivedAt),
    corrects_event_id: e.correctsEventId,
  }));
  const promptSources: PromptSource[] = batch.map((e) => ({
    sequence: e.sequence,
    event_type: e.eventType,
    source: e.source,
    occurred_at: iso(e.occurredAt),
    corrects_sequence: e.correctsEventId ? (sequenceOf.get(e.correctsEventId) ?? null) : null,
    content: sourceContent(e),
  }));
  const newWatermark = batch.at(-1)?.sequence ?? watermark;
  const run = {
    role: 'librarian' as const,
    model: deps.librarianModel.model,
    promptVersion: LIBRARIAN_PROMPT_VERSION,
    inputRevisions: {
      base_version: snapshot?.version ?? null,
      from_sequence: batch[0]?.sequence,
      to_sequence: newWatermark,
    },
  };

  const { value: applied, attempts } = await callWithRepair(
    ctx,
    deps.librarianModel,
    {
      role: 'librarian',
      system: LIBRARIAN_SYSTEM,
      user: librarianUserTurn(memory, promptSources, now.slice(0, 10)),
      schema: MemoryPatch,
      maxOutputTokens: LIBRARIAN_MAX_OUTPUT_TOKENS,
    },
    (patch) => {
      const result = applyPatch(memory, patch, sources, now);
      return result.ok ? { ok: true as const, value: result } : result;
    },
  ).catch((error: unknown) => failWithAttempts(ctx, run, error));

  const version = (snapshot?.version ?? 0) + 1;
  const documents = renderDocuments(applied.memory, {
    version,
    sourceWatermark: newWatermark,
    asOf: now,
  });
  await ctx.commit(
    async (tx) => {
      const committed = await commitBrainSnapshot(tx, {
        workspaceId: ctx.job.workspaceId,
        customerId,
        version,
        baseVersion: snapshot?.version ?? null,
        structured: applied.memory,
        documents,
        signature: signatureOf(applied.memory),
        sourceWatermark: newWatermark,
        modelVersion: deps.librarianModel.model,
        promptVersion: LIBRARIAN_PROMPT_VERSION,
        schemaVersion: MEMORY_SCHEMA_VERSION,
      });
      // Another job advanced the brain first: roll back and rebuild on the newer version.
      if (!committed) throw new JobError('brain_conflict', 'Brain changed; rebuilding', true, 5);
      await recordAttempts(tx, ctx, run, attempts);
      return countSourcesAfter(tx, customerId, newWatermark);
    },
    (pending): LibrarianResult => ({
      brain_version: version,
      source_watermark: newWatermark,
      incorporated_event_ids: batch.map((e) => e.id),
      operations: applied.counts,
      has_pending_sources: pending > 0,
      already_incorporated: false,
    }),
  );
}

const QueryInput = z.object({
  question: z.string().min(1).max(2000),
  brain_version: z.number().int().positive(),
});

/**
 * Grounded read-only answer from one captured brain version. It never writes memory; the job
 * result carries the answer, validated citations and pending-source disclosure.
 */
async function runQuery(deps: LibrarianDeps, ctx: JobContext) {
  const customerId = customerOf(ctx);
  const input = QueryInput.safeParse(ctx.job.input);
  if (!input.success) throw new JobError('invalid_job', 'Query job input is invalid', false);
  const { question, brain_version } = input.data;

  const loaded = await ctx.transaction(async (tx) => {
    const customer = await getCustomer(tx, WORKSPACE_WIDE, customerId);
    if (!customer) return undefined;
    return { customer, snapshot: await getBrainSnapshot(tx, customerId, brain_version) };
  });
  if (!loaded) throw new JobError('customer_unavailable', 'Customer is not active', false);
  if (!loaded.snapshot) throw new JobError('brain_not_ready', 'Brain version not found', false);
  const { snapshot, customer } = loaded;
  const memory = readMemory(snapshot);
  const hasPendingSources = customer.sourceRevision > snapshot.sourceWatermark;
  const documents = snapshot.documents as Record<string, string>;
  const run = {
    role: 'librarian_query' as const,
    model: deps.queryModel.model,
    promptVersion: QUERY_PROMPT_VERSION,
    inputRevisions: { brain_version, source_watermark: snapshot.sourceWatermark },
  };

  const assertionIds = new Set(memory.assertions.map((a) => a.id));
  const eventBySequence = new Map(memory.evidence.map((e) => [e.sequence, e.event_id]));
  const { value: output, attempts } = await callWithRepair(
    ctx,
    deps.queryModel,
    {
      role: 'librarian_query',
      system: QUERY_SYSTEM,
      user: queryUserTurn(bundleDocuments(documents), question, hasPendingSources),
      schema: QueryModelOutput,
      maxOutputTokens: QUERY_MAX_OUTPUT_TOKENS,
    },
    (value) => ({ ok: true as const, value }),
  ).catch((error: unknown) => failWithAttempts(ctx, run, error));

  // Citations outside the captured brain are dropped and disclosed rather than trusted.
  const cited = output.assertion_ids.filter((id) => assertionIds.has(id));
  const evidence = output.evidence.flatMap((s) => eventBySequence.get(s) ?? []);
  const uncertainties = [...output.uncertainties];
  if (cited.length < output.assertion_ids.length || evidence.length < output.evidence.length) {
    uncertainties.push('Some citations did not match this memory and were removed.');
  }
  if (hasPendingSources) {
    uncertainties.push('Newer sources are not yet incorporated into this memory version.');
  }

  await ctx.commit(
    (tx) => recordAttempts(tx, ctx, run, attempts),
    (): QueryResult => ({
      question,
      answer: output.answer,
      answerable: output.answerable,
      brain_version,
      source_watermark: snapshot.sourceWatermark,
      has_pending_sources: hasPendingSources,
      cited_assertion_ids: [...new Set(cited)],
      evidence_event_ids: [...new Set(evidence)],
      uncertainties,
    }),
  );
}
