import { and, eq, gt, sql } from 'drizzle-orm';
import type { Tx } from '../db.js';
import { admissionWindows, auditEvents, idempotencyRecords } from '../schema/index.js';

export type IdempotencyScope = { workspaceId: string; keyId: string; route: string; key: string };

export async function findIdempotencyRecord(tx: Tx, scope: IdempotencyScope) {
  const [row] = await tx
    .select()
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.keyId, scope.keyId),
        eq(idempotencyRecords.route, scope.route),
        eq(idempotencyRecords.idempotencyKey, scope.key),
        gt(idempotencyRecords.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return row;
}

/**
 * Stores a mutation's response in the mutation's own transaction. Returns false when a
 * concurrent request with the same key won; the caller then rolls back and replays that result.
 */
export async function saveIdempotencyRecord(
  tx: Tx,
  scope: IdempotencyScope,
  record: { requestHash: string; status: number; body: unknown; retentionDays?: number },
): Promise<boolean> {
  const rows = await tx
    .insert(idempotencyRecords)
    .values({
      workspaceId: scope.workspaceId,
      keyId: scope.keyId,
      route: scope.route,
      idempotencyKey: scope.key,
      requestHash: record.requestHash,
      responseStatus: record.status,
      responseBody: record.body,
      expiresAt: sql`now() + make_interval(days => ${record.retentionDays ?? 7})`,
    })
    .onConflictDoUpdate({
      // An expired record may be replaced; a live one is left untouched (setWhere fails).
      target: [
        idempotencyRecords.workspaceId,
        idempotencyRecords.keyId,
        idempotencyRecords.route,
        idempotencyRecords.idempotencyKey,
      ],
      set: {
        requestHash: record.requestHash,
        responseStatus: record.status,
        responseBody: record.body,
        createdAt: sql`now()`,
        expiresAt: sql`now() + make_interval(days => ${record.retentionDays ?? 7})`,
      },
      setWhere: sql`${idempotencyRecords.expiresAt} <= now()`,
    })
    .returning({ key: idempotencyRecords.idempotencyKey });
  return rows.length > 0;
}

export type RouteGroup = 'mutation' | 'read' | 'model';

/** Atomic fixed-window counter across API replicas. Returns the count including this request. */
export async function countAdmission(
  tx: Tx,
  input: { workspaceId: string; keyId: string; group: RouteGroup; windowStart: Date },
): Promise<number> {
  const [row] = await tx
    .insert(admissionWindows)
    .values({
      workspaceId: input.workspaceId,
      keyId: input.keyId,
      routeGroup: input.group,
      windowStart: input.windowStart,
      requestCount: 1,
    })
    .onConflictDoUpdate({
      target: [
        admissionWindows.workspaceId,
        admissionWindows.keyId,
        admissionWindows.routeGroup,
        admissionWindows.windowStart,
      ],
      set: { requestCount: sql`${admissionWindows.requestCount} + 1` },
    })
    .returning({ count: admissionWindows.requestCount });
  return row?.count ?? 1;
}

export async function recordAudit(
  tx: Tx,
  event: {
    workspaceId: string;
    actorType: 'api_key' | 'operator' | 'service';
    actorId?: string;
    eventType: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(auditEvents).values({ ...event, metadata: event.metadata ?? {} });
}
