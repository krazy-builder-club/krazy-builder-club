import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { Tx } from '../db.js';
import { customers, insights, sourceEvents } from '../schema/index.js';
import { enqueueJob } from './jobs.js';

export type SourceEventRow = typeof sourceEvents.$inferSelect;

export type AppendSourceInput = {
  workspaceId: string;
  customerId: string;
  source: string;
  sourceEventId: string;
  eventType: string;
  occurredAt: Date;
  payload?: unknown;
  payloadText?: string;
  correctsEventId?: string;
  /** SHA-256 of the canonical validated input. */
  payloadHash: string;
};

export type AppendSourceResult =
  | { status: 'accepted'; event: SourceEventRow; jobId: string; sourceRevision: number }
  | { status: 'duplicate'; event: SourceEventRow; jobId: string; sourceRevision: number }
  | { status: 'identity_conflict' }
  | { status: 'customer_unavailable' }
  | { status: 'correction_target_missing' };

export const librarianOperationKey = (eventId: string) => `librarian:event:${eventId}`;

/**
 * Appends one source event, its Librarian job and outbox row in the caller's transaction.
 *
 * The customer row lock serializes per-customer sequence allocation. The same source identity
 * with the same hash returns the original job; a changed body is an identity conflict (append a
 * correction instead). Any new input conservatively marks older pending insights stale.
 * Ingestion never enqueues the Proactor: the weekly review is scheduled independently.
 */
export async function appendSourceEvent(
  tx: Tx,
  input: AppendSourceInput,
): Promise<AppendSourceResult> {
  const [customer] = await tx
    .select({ state: customers.state, sourceRevision: customers.sourceRevision })
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .for('update')
    .limit(1);
  if (customer?.state !== 'active') return { status: 'customer_unavailable' };

  const [existing] = await tx
    .select()
    .from(sourceEvents)
    .where(
      and(
        eq(sourceEvents.customerId, input.customerId),
        eq(sourceEvents.source, input.source),
        eq(sourceEvents.sourceEventId, input.sourceEventId),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.payloadHash !== input.payloadHash) return { status: 'identity_conflict' };
    const { job } = await enqueueJob(tx, {
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      kind: 'librarian',
      operationKey: librarianOperationKey(existing.id),
      input: { event_id: existing.id },
    });
    return {
      status: 'duplicate',
      event: existing,
      jobId: job.id,
      sourceRevision: existing.sequence,
    };
  }

  if (input.correctsEventId) {
    const [target] = await tx
      .select({ id: sourceEvents.id })
      .from(sourceEvents)
      .where(
        and(
          eq(sourceEvents.customerId, input.customerId),
          eq(sourceEvents.id, input.correctsEventId),
        ),
      )
      .limit(1);
    if (!target) return { status: 'correction_target_missing' };
  }

  const sequence = customer.sourceRevision + 1;
  await tx
    .update(customers)
    .set({ sourceRevision: sequence })
    .where(eq(customers.id, input.customerId));

  const [event] = await tx
    .insert(sourceEvents)
    .values({
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      sequence,
      source: input.source,
      sourceEventId: input.sourceEventId,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      payload: input.payloadText === undefined ? (input.payload ?? null) : null,
      payloadText: input.payloadText,
      payloadHash: input.payloadHash,
      correctsEventId: input.correctsEventId,
    })
    .returning();
  if (!event) throw new Error('source event insert returned no row');

  await tx
    .update(insights)
    .set({ lifecycle: 'stale', updatedAt: sql`now()` })
    .where(and(eq(insights.customerId, input.customerId), eq(insights.lifecycle, 'pending')));

  const { job } = await enqueueJob(tx, {
    workspaceId: input.workspaceId,
    customerId: input.customerId,
    kind: 'librarian',
    operationKey: librarianOperationKey(event.id),
    input: { event_id: event.id },
  });
  return { status: 'accepted', event, jobId: job.id, sourceRevision: sequence };
}

export async function getSourceEvent(tx: Tx, customerId: string, eventId: string) {
  const [row] = await tx
    .select()
    .from(sourceEvents)
    .where(and(eq(sourceEvents.customerId, customerId), eq(sourceEvents.id, eventId)))
    .limit(1);
  return row;
}

export async function listSourceEvents(
  tx: Tx,
  customerId: string,
  page: { afterSequence?: number; limit: number },
) {
  const rows = await tx
    .select()
    .from(sourceEvents)
    .where(
      and(
        eq(sourceEvents.customerId, customerId),
        page.afterSequence === undefined
          ? undefined
          : gt(sourceEvents.sequence, page.afterSequence),
      ),
    )
    .orderBy(asc(sourceEvents.sequence))
    .limit(page.limit + 1);
  const hasMore = rows.length > page.limit;
  const items = rows.slice(0, page.limit);
  return { items, nextSequence: hasMore ? items.at(-1)?.sequence : undefined };
}
