import { JobKind, QUEUE_FOR_JOB } from '@bob/contracts';
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db.js';
import { jobs, outbox } from '../schema/index.js';

export type JobRow = typeof jobs.$inferSelect;

/**
 * Creates a job and its first outbox row in the caller's transaction. The operation key makes
 * this idempotent: a repeated operation returns the existing job and enqueues nothing.
 */
export async function enqueueJob(
  tx: Tx,
  input: {
    workspaceId: string;
    customerId?: string;
    kind: JobKind;
    operationKey: string;
    input?: Record<string, unknown>;
    availableAt?: Date;
  },
): Promise<{ job: JobRow; created: boolean }> {
  const [created] = await tx
    .insert(jobs)
    .values({
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      kind: input.kind,
      operationKey: input.operationKey,
      input: input.input ?? {},
      availableAt: input.availableAt,
    })
    .onConflictDoNothing({ target: [jobs.workspaceId, jobs.operationKey] })
    .returning();
  if (created) {
    await tx.insert(outbox).values({
      workspaceId: input.workspaceId,
      jobId: created.id,
      queue: QUEUE_FOR_JOB[input.kind],
      nextAttemptAt: input.availableAt,
    });
    return { job: created, created: true };
  }
  const [existing] = await tx
    .select()
    .from(jobs)
    .where(eq(jobs.operationKey, input.operationKey))
    .limit(1);
  if (!existing) throw new Error('job operation conflict without a visible job');
  return { job: existing, created: false };
}

export async function getJob(tx: Tx, jobId: string): Promise<JobRow | undefined> {
  const [row] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return row;
}

export type ClaimedJob = JobRow & { leaseToken: number };

/**
 * Claims a due job with a fresh fencing token. Returns undefined when the job is terminal,
 * not yet due, or leased by someone else — duplicate task deliveries are normal and harmless.
 */
export async function claimJob(
  tx: Tx,
  jobId: string,
  leaseSeconds: number,
): Promise<ClaimedJob | undefined> {
  const [row] = await tx
    .update(jobs)
    .set({
      status: 'running',
      attempts: sql`${jobs.attempts} + 1`,
      leaseToken: sql`${jobs.leaseToken} + 1`,
      leaseUntil: sql`now() + make_interval(secs => ${leaseSeconds})`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(jobs.id, jobId),
        inArray(jobs.status, ['queued', 'retry_wait']),
        lte(jobs.availableAt, sql`now()`),
      ),
    )
    .returning();
  return row;
}

/** Commits a result only while the caller still holds the lease it claimed with. */
export async function completeJob(tx: Tx, jobId: string, leaseToken: number, result: unknown) {
  const rows = await tx
    .update(jobs)
    .set({
      status: 'succeeded',
      result,
      leaseUntil: null,
      finishedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(jobs.id, jobId), eq(jobs.leaseToken, leaseToken), eq(jobs.status, 'running')))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

/**
 * Records a failure under the caller's lease. Retryable failures with attempts left move to
 * `retry_wait` with backoff and a new outbox generation; everything else becomes terminal.
 */
export async function failJob(
  tx: Tx,
  jobId: string,
  leaseToken: number,
  failure: { code: string; message: string; retryable: boolean; backoffSeconds?: number },
): Promise<'retry_wait' | 'failed' | 'lost_lease'> {
  const [job] = await tx
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.leaseToken, leaseToken), eq(jobs.status, 'running')))
    .for('update')
    .limit(1);
  if (!job) return 'lost_lease';
  const retry = failure.retryable && job.attempts < job.maxAttempts;
  const availableAt = new Date(Date.now() + (failure.backoffSeconds ?? 60) * 1000);
  await tx
    .update(jobs)
    .set({
      status: retry ? 'retry_wait' : 'failed',
      errorCode: failure.code,
      errorMessage: failure.message,
      leaseUntil: null,
      availableAt: retry ? availableAt : job.availableAt,
      finishedAt: retry ? null : sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(jobs.id, jobId));
  if (retry) {
    const [last] = await tx
      .select({ generation: outbox.generation, queue: outbox.queue })
      .from(outbox)
      .where(eq(outbox.jobId, jobId))
      .orderBy(desc(outbox.generation))
      .limit(1);
    await tx.insert(outbox).values({
      workspaceId: job.workspaceId,
      jobId,
      generation: (last?.generation ?? 0) + 1,
      queue: last?.queue ?? 'memory',
      nextAttemptAt: availableAt,
    });
  }
  return retry ? 'retry_wait' : 'failed';
}

// --- Cross-workspace transport operations (definer functions, worker role only) ---

export type ClaimedOutbox = {
  outboxId: string;
  workspaceId: string;
  jobId: string;
  generation: number;
  queue: string;
  kind: JobKind;
};

export async function claimOutbox(
  db: Db,
  kinds: readonly JobKind[],
  limit: number,
  claimSeconds: number,
): Promise<ClaimedOutbox[]> {
  const result = await db.execute<{
    outbox_id: string;
    workspace_id: string;
    job_id: string;
    generation: number;
    queue: string;
    kind: JobKind;
  }>(
    // A single text parameter in PostgreSQL array-literal form; kinds are closed enum tokens.
    sql`select * from public.bob_claim_outbox(${`{${kinds.map((k) => JobKind.parse(k)).join(',')}}`}::text[], ${limit}, ${claimSeconds})`,
  );
  return result.rows.map((r) => ({
    outboxId: r.outbox_id,
    workspaceId: r.workspace_id,
    jobId: r.job_id,
    generation: r.generation,
    queue: r.queue,
    kind: r.kind,
  }));
}

export async function markOutboxDispatched(db: Db, outboxId: string, transportName: string) {
  await db.execute(sql`select public.bob_mark_outbox_dispatched(${outboxId}, ${transportName})`);
}

export async function reconcileJobs(db: Db, opts: { limit: number; lostDispatchSeconds: number }) {
  const expired = await db.execute<{ n: number }>(
    sql`select public.bob_reconcile_expired_leases(${opts.limit}) as n`,
  );
  const lost = await db.execute<{ n: number }>(
    sql`select public.bob_reconcile_lost_dispatches(${opts.lostDispatchSeconds}, ${opts.limit}) as n`,
  );
  return { expiredLeases: expired.rows[0]?.n ?? 0, lostDispatches: lost.rows[0]?.n ?? 0 };
}
