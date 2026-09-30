import type { JobKind, QueueKind } from '@bob/contracts';
import { claimOutbox, type Db, markOutboxDispatched, reconcileJobs } from '@bob/storage';
import { log } from '../lib/log.js';
import type { HandlerRegistry } from './runner.js';
import { type TaskTransport, taskName } from './transport.js';

export type TickResult = {
  dispatched: number;
  failed: number;
  expiredLeases: number;
  lostDispatches: number;
};

/**
 * One clock tick: reconcile expired leases/lost transports, then turn due outbox rows into tasks.
 * Scheduler may deliver ticks twice or concurrently; SKIP LOCKED claims and deterministic task
 * names keep that harmless. Weekly subscription fan-out joins this tick with the Proactor work.
 */
export async function tick(
  deps: { db: Db; handlers: HandlerRegistry; transport: TaskTransport },
  opts: { batch?: number; claimSeconds?: number; lostDispatchSeconds?: number } = {},
): Promise<TickResult> {
  const reconciled = await reconcileJobs(deps.db, {
    limit: opts.batch ?? 100,
    lostDispatchSeconds: opts.lostDispatchSeconds ?? 900,
  });
  const kinds = Object.keys(deps.handlers) as JobKind[];
  if (kinds.length === 0) return { dispatched: 0, failed: 0, ...reconciled };

  const claimed = await claimOutbox(deps.db, kinds, opts.batch ?? 100, opts.claimSeconds ?? 120);
  let dispatched = 0;
  let failed = 0;
  for (const row of claimed) {
    const name = taskName(row.jobId, row.generation);
    try {
      await deps.transport.enqueue({
        queue: row.queue as QueueKind,
        kind: row.kind,
        workspaceId: row.workspaceId,
        jobId: row.jobId,
        name,
      });
      await markOutboxDispatched(deps.db, row.outboxId, name);
      dispatched++;
    } catch (error) {
      // The claim expires and the row is retried on a later tick with the same task name.
      failed++;
      log.warn('dispatch_failed', {
        job_id: row.jobId,
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  if (dispatched || failed || reconciled.expiredLeases || reconciled.lostDispatches) {
    log.info('tick', { dispatched, failed, ...reconciled });
  }
  return { dispatched, failed, ...reconciled };
}
