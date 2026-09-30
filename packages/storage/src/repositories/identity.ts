import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db.js';
import { apiKeyCustomers, apiKeys, workspaces } from '../schema/index.js';

export type ApiKeyIdentity = {
  keyId: string;
  workspaceId: string;
  capabilities: string[];
  allCustomers: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  workspaceState: string;
};

/**
 * Resolves an exact key hash through the narrow `bob_lookup_api_key` definer function. This is
 * the only unscoped read the API role can make, and it returns identity metadata only.
 */
export async function lookupApiKey(db: Db, keyHash: string): Promise<ApiKeyIdentity | undefined> {
  const result = await db.execute<{
    key_id: string;
    workspace_id: string;
    capabilities: string[];
    all_customers: boolean;
    expires_at: Date | null;
    revoked_at: Date | null;
    workspace_state: string;
  }>(sql`select * from public.bob_lookup_api_key(${keyHash})`);
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    keyId: row.key_id,
    workspaceId: row.workspace_id,
    capabilities: row.capabilities,
    allCustomers: row.all_customers,
    expiresAt: row.expires_at && new Date(row.expires_at),
    revokedAt: row.revoked_at && new Date(row.revoked_at),
    workspaceState: row.workspace_state,
  };
}

/** Customer grant a request carries: workspace-wide, or an explicit set bound to the key. */
export type CustomerGrant = { allCustomers: true } | { allCustomers: false; keyId: string };

export async function hasCustomerGrant(tx: Tx, keyId: string, customerId: string) {
  const rows = await tx
    .select({ customerId: apiKeyCustomers.customerId })
    .from(apiKeyCustomers)
    .where(and(eq(apiKeyCustomers.keyId, keyId), eq(apiKeyCustomers.customerId, customerId)))
    .limit(1);
  return rows.length > 0;
}

// --- Operator-only operations (run through the IAM-restricted operator CLI) ---

export async function insertWorkspace(tx: Tx, input: { id: string; name: string }) {
  const [row] = await tx.insert(workspaces).values(input).returning();
  if (!row) throw new Error('workspace insert returned no row');
  return row;
}

export async function insertApiKey(
  tx: Tx,
  input: {
    workspaceId: string;
    name: string;
    prefix: string;
    keyHash: string;
    capabilities: string[];
    allCustomers: boolean;
    expiresAt?: Date;
    customerIds?: string[];
  },
) {
  const { customerIds = [], ...values } = input;
  const [row] = await tx.insert(apiKeys).values(values).returning({
    id: apiKeys.id,
    prefix: apiKeys.prefix,
    createdAt: apiKeys.createdAt,
  });
  if (!row) throw new Error('api key insert returned no row');
  if (customerIds.length > 0) {
    await tx.insert(apiKeyCustomers).values(
      customerIds.map((customerId) => ({
        workspaceId: input.workspaceId,
        keyId: row.id,
        customerId,
      })),
    );
  }
  return row;
}

export async function revokeApiKey(tx: Tx, keyId: string) {
  const rows = await tx
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return rows.length > 0;
}

export async function listApiKeys(tx: Tx) {
  return tx
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      capabilities: apiKeys.capabilities,
      allCustomers: apiKeys.allCustomers,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .orderBy(apiKeys.createdAt);
}
