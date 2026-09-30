import { ALL_CAPABILITIES, CustomerState, DataKind } from '@bob/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, oneOf, ts } from './columns.js';

/** Tenant boundary. Every other tenant table carries `workspace_id` and is RLS-scoped to it. */
export const workspaces = pgTable(
  'workspaces',
  {
    id: id(),
    name: text('name').notNull(),
    dataKind: text('data_kind').notNull().default('synthetic'),
    state: text('state').notNull().default('active'),
    config: jsonb('config').notNull().default({}),
    createdAt: createdAt(),
  },
  () => [
    check('workspaces_data_kind_check', oneOf('data_kind', DataKind.options)),
    check('workspaces_state_check', oneOf('state', ['active', 'suspended'])),
  ],
);

/** Opaque API keys stored as HMAC-SHA256 hex plus a display prefix; plaintext is shown once. */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    prefix: text('prefix').notNull().unique(),
    keyHash: text('key_hash').notNull().unique(),
    capabilities: text('capabilities').array().notNull(),
    allCustomers: boolean('all_customers').notNull(),
    expiresAt: ts('expires_at'),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('api_keys_workspace_id_unique').on(t.workspaceId, t.id),
    check(
      'api_keys_capabilities_check',
      sql.raw(`capabilities <@ array[${ALL_CAPABILITIES.map((c) => `'${c}'`).join(', ')}]::text[]`),
    ),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    externalId: text('external_id').notNull(),
    state: text('state').notNull().default('active'),
    referenceEligible: boolean('reference_eligible').notNull().default(false),
    /** Monotonic per-customer input counter; each accepted source takes the next value. */
    sourceRevision: integer('source_revision').notNull().default(0),
    currentBrainVersion: integer('current_brain_version'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('customers_workspace_external_unique').on(t.workspaceId, t.externalId),
    unique('customers_workspace_id_unique').on(t.workspaceId, t.id),
    check('customers_state_check', oneOf('state', CustomerState.options)),
  ],
);

/** Explicit customer grants for keys without `all_customers`. */
export const apiKeyCustomers = pgTable(
  'api_key_customers',
  {
    workspaceId: uuid('workspace_id').notNull(),
    keyId: uuid('key_id').notNull(),
    customerId: uuid('customer_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.keyId, t.customerId] }),
    foreignKey({
      columns: [t.workspaceId, t.keyId],
      foreignColumns: [apiKeys.workspaceId, apiKeys.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.customerId],
      foreignColumns: [customers.workspaceId, customers.id],
    }),
  ],
);

/**
 * HTTP `Idempotency-Key` results, bound to key/route/body hash and retained at least seven days
 * (docs/data.md#source-and-upload-lifecycles).
 */
export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    keyId: uuid('key_id').notNull(),
    route: text('route').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: createdAt(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.keyId, t.route, t.idempotencyKey] }),
    foreignKey({
      columns: [t.workspaceId, t.keyId],
      foreignColumns: [apiKeys.workspaceId, apiKeys.id],
    }),
  ],
);

/** Transactional fixed-window admission counters shared across API replicas. */
export const admissionWindows = pgTable(
  'admission_windows',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    keyId: uuid('key_id').notNull(),
    routeGroup: text('route_group').notNull(),
    windowStart: ts('window_start').notNull(),
    requestCount: integer('request_count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.keyId, t.routeGroup, t.windowStart] }),
    check('admission_windows_group_check', oneOf('route_group', ['mutation', 'read', 'model'])),
  ],
);

/** Non-content operational audit trail: IDs, types and scrubbed metadata only. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    eventType: text('event_type').notNull(),
    targetId: text('target_id'),
    metadata: jsonb('metadata').notNull().default({}),
    occurredAt: createdAt(),
  },
  (t) => [
    index('audit_events_workspace_time_idx').on(t.workspaceId, t.occurredAt),
    check('audit_events_actor_check', oneOf('actor_type', ['api_key', 'operator', 'service'])),
  ],
);
