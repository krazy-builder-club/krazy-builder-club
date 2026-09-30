import { and, asc, eq, exists, type SQL, sql } from 'drizzle-orm';
import type { Tx } from '../db.js';
import { apiKeyCustomers, customers } from '../schema/index.js';
import type { CustomerGrant } from './identity.js';

export type CustomerRow = typeof customers.$inferSelect;

/** Restricts customer rows to the request's grant. RLS already restricts the workspace. */
export function grantCondition(grant: CustomerGrant): SQL | undefined {
  if (grant.allCustomers) return undefined;
  return exists(
    sql`(select 1 from ${apiKeyCustomers} where ${apiKeyCustomers.keyId} = ${grant.keyId} and ${apiKeyCustomers.customerId} = ${customers.id})`,
  );
}

export async function insertCustomer(
  tx: Tx,
  input: { workspaceId: string; externalId: string },
): Promise<CustomerRow | undefined> {
  const [row] = await tx
    .insert(customers)
    .values(input)
    .onConflictDoNothing({ target: [customers.workspaceId, customers.externalId] })
    .returning();
  return row;
}

export async function findCustomerByExternalId(tx: Tx, externalId: string) {
  const [row] = await tx
    .select()
    .from(customers)
    .where(eq(customers.externalId, externalId))
    .limit(1);
  return row;
}

/** Only `active` customers are readable; `deleting` blocks reads immediately (docs/data.md). */
export async function getCustomer(tx: Tx, grant: CustomerGrant, customerId: string) {
  const [row] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.state, 'active'), grantCondition(grant)))
    .limit(1);
  return row;
}

/**
 * Keyset position. `createdAt` is PostgreSQL's own text rendering (microsecond precision): a JS
 * `Date` would truncate to milliseconds and re-include rows on the next page.
 */
export type Cursor = { createdAt: string; id: string };

export async function listCustomers(
  tx: Tx,
  grant: CustomerGrant,
  page: { after?: Cursor; limit: number },
) {
  const after = page.after
    ? sql`(${customers.createdAt}, ${customers.id}) > (${page.after.createdAt}::timestamptz, ${page.after.id}::uuid)`
    : undefined;
  const rows = await tx
    .select({ customer: customers, position: sql<string>`${customers.createdAt}::text` })
    .from(customers)
    .where(and(eq(customers.state, 'active'), grantCondition(grant), after))
    .orderBy(asc(customers.createdAt), asc(customers.id))
    .limit(page.limit + 1);
  const hasMore = rows.length > page.limit;
  const items = rows.slice(0, page.limit);
  const last = items.at(-1);
  return {
    items: items.map((r) => r.customer),
    next: hasMore && last ? { createdAt: last.position, id: last.customer.id } : undefined,
  };
}
