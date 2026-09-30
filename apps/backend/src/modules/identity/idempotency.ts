import {
  type Db,
  findIdempotencyRecord,
  saveIdempotencyRecord,
  type Tx,
  withWorkspace,
} from '@bob/storage';
import { AppError, errors } from '../../lib/errors.js';
import type { AuthContext } from './auth.js';

const KEY = /^[A-Za-z0-9._:-]{1,200}$/;

export function readIdempotencyKey(header: string | undefined, required: boolean) {
  if (header === undefined) {
    if (required) throw errors.idempotencyRequired();
    return undefined;
  }
  if (!KEY.test(header)) {
    throw new AppError('validation_error', 400, 'Idempotency-Key must be 1-200 of [A-Za-z0-9._:-]');
  }
  return header;
}

type Stored = { status: number; body: unknown };

class LostRace extends Error {}

/**
 * Runs a mutation once per (key, route, Idempotency-Key). The mutation and its stored response
 * commit in one scoped transaction. Same key + same body replays the stored response; a changed
 * body is `409 idempotency_conflict`. A concurrent duplicate that loses the insert race rolls
 * back and replays the winner's response.
 */
export async function idempotent(
  db: Db,
  auth: AuthContext,
  opts: { route: string; key: string | undefined; requestHash: string },
  mutation: (tx: Tx) => Promise<Stored>,
): Promise<Stored> {
  if (opts.key === undefined) return withWorkspace(db, auth.workspaceId, mutation);
  const scope = {
    workspaceId: auth.workspaceId,
    keyId: auth.keyId,
    route: opts.route,
    key: opts.key,
  };
  const replay = async (tx: Tx): Promise<Stored | undefined> => {
    const existing = await findIdempotencyRecord(tx, scope);
    if (!existing) return undefined;
    if (existing.requestHash !== opts.requestHash) throw errors.idempotencyConflict();
    return { status: existing.responseStatus, body: existing.responseBody };
  };
  try {
    return await withWorkspace(db, auth.workspaceId, async (tx) => {
      const prior = await replay(tx);
      if (prior) return prior;
      const result = await mutation(tx);
      const saved = await saveIdempotencyRecord(tx, scope, {
        requestHash: opts.requestHash,
        status: result.status,
        body: result.body,
      });
      if (!saved) throw new LostRace();
      return result;
    });
  } catch (error) {
    if (!(error instanceof LostRace)) throw error;
    const winner = await withWorkspace(db, auth.workspaceId, replay);
    if (!winner) throw error;
    return winner;
  }
}
