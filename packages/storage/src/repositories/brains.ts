import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../db.js';
import { brainSnapshots, customers, modelRuns, sourceEvents } from '../schema/index.js';

export type BrainSnapshotRow = typeof brainSnapshots.$inferSelect;

/** Latest snapshot, or a specific version when given. RLS scopes the workspace. */
export async function getBrainSnapshot(
  tx: Tx,
  customerId: string,
  version?: number,
): Promise<BrainSnapshotRow | undefined> {
  const [row] = await tx
    .select()
    .from(brainSnapshots)
    .where(
      and(
        eq(brainSnapshots.customerId, customerId),
        version === undefined ? undefined : eq(brainSnapshots.version, version),
      ),
    )
    .orderBy(desc(brainSnapshots.version))
    .limit(1);
  return row;
}

/** Customer row locked for the rest of the transaction: serializes brain commits per customer. */
export async function lockCustomer(tx: Tx, customerId: string) {
  const [row] = await tx
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .for('update')
    .limit(1);
  return row;
}

/**
 * Inserts an immutable snapshot and advances the customer's current version, only if the current
 * version still equals `baseVersion` (null for the first snapshot). Returns false on a lost race;
 * the caller rolls back and rebuilds on the newer brain.
 */
export async function commitBrainSnapshot(
  tx: Tx,
  snapshot: typeof brainSnapshots.$inferInsert,
): Promise<boolean> {
  const base = snapshot.baseVersion ?? null;
  const advanced = await tx
    .update(customers)
    .set({ currentBrainVersion: snapshot.version })
    .where(
      and(
        eq(customers.id, snapshot.customerId),
        eq(customers.state, 'active'),
        base === null
          ? isNull(customers.currentBrainVersion)
          : eq(customers.currentBrainVersion, base),
      ),
    )
    .returning({ id: customers.id });
  if (advanced.length === 0) return false;
  await tx.insert(brainSnapshots).values(snapshot);
  return true;
}

/** Source events not yet incorporated (sequence above the watermark), oldest first. */
export async function listSourceEventsAfter(
  tx: Tx,
  customerId: string,
  afterSequence: number,
  limit: number,
) {
  return tx
    .select()
    .from(sourceEvents)
    .where(and(eq(sourceEvents.customerId, customerId), gt(sourceEvents.sequence, afterSequence)))
    .orderBy(asc(sourceEvents.sequence))
    .limit(limit);
}

/** Records one model call: versions, revisions, usage and outcome. Never prompts or outputs. */
export async function recordModelRun(tx: Tx, run: typeof modelRuns.$inferInsert) {
  await tx.insert(modelRuns).values(run);
}

export async function countSourcesAfter(tx: Tx, customerId: string, afterSequence: number) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(sourceEvents)
    .where(and(eq(sourceEvents.customerId, customerId), gt(sourceEvents.sequence, afterSequence)));
  return row?.n ?? 0;
}
