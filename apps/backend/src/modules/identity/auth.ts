import type { Capability } from '@bob/contracts';
import {
  type CustomerGrant,
  countAdmission,
  type Db,
  getCustomer,
  lookupApiKey,
  type RouteGroup,
  type Tx,
  withWorkspace,
} from '@bob/storage';
import type { Context, MiddlewareHandler } from 'hono';
import { errors } from '../../lib/errors.js';
import { hashApiKey, isWellFormedApiKey } from './api-keys.js';

export type AuthContext = {
  workspaceId: string;
  keyId: string;
  capabilities: ReadonlySet<Capability>;
  grant: CustomerGrant;
};

export type AppEnv = { Variables: { requestId: string; auth: AuthContext } };

/**
 * Bearer API-key authentication. The workspace comes from the verified key, never from the
 * request. Expired/revoked keys and suspended workspaces are indistinguishable from unknown keys.
 */
export function apiKeyAuth(deps: {
  db: Db;
  pepper: string;
  now?: () => Date;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!isWellFormedApiKey(token)) throw errors.unauthenticated();
    const identity = await lookupApiKey(deps.db, hashApiKey(deps.pepper, token));
    const now = deps.now?.() ?? new Date();
    if (
      !identity ||
      identity.revokedAt ||
      (identity.expiresAt && identity.expiresAt <= now) ||
      identity.workspaceState !== 'active'
    ) {
      throw errors.unauthenticated();
    }
    c.set('auth', {
      workspaceId: identity.workspaceId,
      keyId: identity.keyId,
      capabilities: new Set(identity.capabilities as Capability[]),
      grant: identity.allCustomers
        ? { allCustomers: true }
        : { allCustomers: false, keyId: identity.keyId },
    });
    await next();
  };
}

export function requireCapability(c: Context<AppEnv>, capability: Capability): AuthContext {
  const auth = c.get('auth');
  if (!auth.capabilities.has(capability)) throw errors.forbidden();
  return auth;
}

/** Loads a customer the key may see, inside the caller's scoped transaction, or 404s. */
export async function requireCustomer(tx: Tx, auth: AuthContext, customerId: string) {
  const customer = await getCustomer(tx, auth.grant, customerId);
  if (!customer) throw errors.notFound('Customer');
  return customer;
}

export type AdmissionLimits = Record<RouteGroup, number>;

/**
 * Shared fixed-window admission per workspace key, persisted in SQL so every API replica
 * counts against the same window. Counted in its own short transaction.
 */
export function admission(
  deps: { db: Db; limits: AdmissionLimits; now?: () => Date },
  group: RouteGroup,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    const now = deps.now?.() ?? new Date();
    const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const count = await withWorkspace(deps.db, auth.workspaceId, (tx) =>
      countAdmission(tx, { workspaceId: auth.workspaceId, keyId: auth.keyId, group, windowStart }),
    );
    if (count > deps.limits[group]) {
      c.header('Retry-After', String(60 - now.getUTCSeconds()));
      throw errors.rateLimited();
    }
    await next();
  };
}
