import type { JobKind } from '@bob/contracts';
import {
  type ClaimedJob,
  claimJob,
  completeJob,
  type Db,
  failJob,
  type Tx,
  withWorkspace,
} from '@bob/storage';
import { sql } from 'drizzle-orm';
import { log } from '../lib/log.js';

/** Bounded handler deadline; the lease outlives it so a slow commit is still fenced. */
export const HANDLER_DEADLINE_MS = 240_000;
export const LEASE_SECONDS = 290;

/** A failure the handler classified. Anything else is treated as a retryable internal error. */
export class JobError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly backoffSeconds = 60,
  ) {
    super(message);
    this.name = 'JobError';
  }
}

export type JobContext = {
  job: ClaimedJob;
  signal: AbortSignal;
  /**
   * Commits domain changes and the job result atomically, only if this attempt still holds the
   * lease. Never call a model or webhook inside `fn` — no transaction spans external work.
   */
  commit: <T>(fn: (tx: Tx) => Promise<T>, result?: (value: T) => unknown) => Promise<T>;
  /**
   * A short workspace-scoped transaction for loading inputs or recording diagnostics. It does not
   * complete the job and must not span a model or webhook call either.
   */
  transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
};

export type JobHandler = (ctx: JobContext) => Promise<void>;

/** Only kinds with an implemented handler are dispatched; others stay queued, not failed. */
export type HandlerRegistry = Partial<Record<JobKind, JobHandler>>;

export type RunOutcome = 'succeeded' | 'retry_wait' | 'failed' | 'skipped' | 'lost_lease';

class LeaseLost extends Error {}

/**
 * Executes one job delivery. Duplicate/stale deliveries are `skipped`. Every outcome is final
 * from the transport's point of view: durable retries go through the outbox, not the queue.
 */
export async function runJob(
  deps: { db: Db; handlers: HandlerRegistry },
  kind: JobKind,
  ids: { workspaceId: string; jobId: string },
): Promise<RunOutcome> {
  const handler = deps.handlers[kind];
  if (!handler) return 'skipped';
  const job = await withWorkspace(deps.db, ids.workspaceId, async (tx) => {
    const claimed = await claimJob(tx, ids.jobId, LEASE_SECONDS);
    // The transport's kind must match the stored job; a mismatch is not ours to run.
    if (claimed && claimed.kind !== kind) throw new Error('job kind mismatch');
    return claimed;
  });
  if (!job) return 'skipped';

  const fields = { job_id: job.id, workspace_id: job.workspaceId, kind, attempt: job.attempts };
  const started = performance.now();
  const signal = AbortSignal.timeout(HANDLER_DEADLINE_MS);
  let completed = false;

  const commit: JobContext['commit'] = async (fn, result) =>
    withWorkspace(deps.db, job.workspaceId, async (tx) => {
      const held = await tx.execute(
        sql`select 1 from jobs where id = ${job.id} and lease_token = ${job.leaseToken} and status = 'running' for update`,
      );
      if (held.rows.length === 0) throw new LeaseLost();
      const value = await fn(tx);
      if (!(await completeJob(tx, job.id, job.leaseToken, result ? result(value) : null))) {
        throw new LeaseLost();
      }
      completed = true;
      return value;
    });

  const transaction: JobContext['transaction'] = (fn) =>
    withWorkspace(deps.db, job.workspaceId, fn);

  try {
    await handler({ job, signal, commit, transaction });
    if (!completed) {
      await withWorkspace(deps.db, job.workspaceId, (tx) =>
        completeJob(tx, job.id, job.leaseToken, null),
      );
    }
    log.info('job_succeeded', { ...fields, duration_ms: Math.round(performance.now() - started) });
    return 'succeeded';
  } catch (error) {
    if (error instanceof LeaseLost) {
      log.warn('job_lease_lost', fields);
      return 'lost_lease';
    }
    const failure =
      error instanceof JobError
        ? {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            backoffSeconds: error.backoffSeconds,
          }
        : signal.aborted
          ? { code: 'deadline_exceeded', message: 'Handler deadline exceeded', retryable: true }
          : { code: 'internal_error', message: 'Job handler failed', retryable: true };
    const outcome = await withWorkspace(deps.db, job.workspaceId, (tx) =>
      failJob(tx, job.id, job.leaseToken, failure),
    );
    log.warn('job_failed', {
      ...fields,
      code: failure.code,
      outcome,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return outcome;
  }
}
