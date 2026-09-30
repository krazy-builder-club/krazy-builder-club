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
import { customers, workspaces } from './tenancy.js';

export const FILE_STATES = [
  'pending',
  'finalized',
  'extracting',
  'ready',
  'unsupported',
  'failed',
] as const;

/** Original file bytes live in GCS; this row pins the exact object generation used as evidence. */
export const files = pgTable(
  'files',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid('customer_id').notNull(),
    objectKey: text('object_key').notNull().unique(),
    generation: bigint('generation', { mode: 'bigint' }),
    filename: text('filename').notNull(),
    claimedMime: text('claimed_mime').notNull(),
    detectedMime: text('detected_mime'),
    claimedBytes: integer('claimed_bytes').notNull(),
    actualBytes: integer('actual_bytes'),
    sha256: text('sha256'),
    state: text('state').notNull().default('pending'),
    extraction: jsonb('extraction'),
    uploadExpiresAt: ts('upload_expires_at').notNull(),
    finalizedAt: ts('finalized_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('files_scope_unique').on(t.workspaceId, t.customerId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.customerId],
      foreignColumns: [customers.workspaceId, customers.id],
    }),
    check('files_state_check', oneOf('state', FILE_STATES)),
    // Generation is fixed at finalization and never changes afterwards.
    check('files_generation_check', sql`state = 'pending' or generation is not null`),
  ],
);

/**
 * Append-only raw inputs. Corrections are new rows pointing at a prior event of the same customer
 * (the composite FK makes a cross-customer correction target impossible).
 */
export const sourceEvents = pgTable(
  'source_events',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid('customer_id').notNull(),
    sequence: integer('sequence').notNull(),
    source: text('source').notNull(),
    sourceEventId: text('source_event_id').notNull(),
    eventType: text('event_type').notNull(),
    occurredAt: ts('occurred_at').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow(),
    payload: jsonb('payload'),
    payloadText: text('payload_text'),
    fileId: uuid('file_id'),
    payloadHash: text('payload_hash').notNull(),
    correctsEventId: uuid('corrects_event_id'),
  },
  (t) => [
    unique('source_events_identity_unique').on(
      t.workspaceId,
      t.customerId,
      t.source,
      t.sourceEventId,
    ),
    unique('source_events_sequence_unique').on(t.workspaceId, t.customerId, t.sequence),
    unique('source_events_scope_unique').on(t.workspaceId, t.customerId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.customerId],
      foreignColumns: [customers.workspaceId, customers.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.customerId, t.fileId],
      foreignColumns: [files.workspaceId, files.customerId, files.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.customerId, t.correctsEventId],
      foreignColumns: [t.workspaceId, t.customerId, t.id],
    }),
    check('source_events_body_check', sql`num_nonnulls(payload, payload_text, file_id) = 1`),
  ],
);

/** Immutable brain versions: canonical structured memory plus its rendered Markdown documents. */
export const brainSnapshots = pgTable(
  'brain_snapshots',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid('customer_id').notNull(),
    version: integer('version').notNull(),
    baseVersion: integer('base_version'),
    structured: jsonb('structured').notNull(),
    documents: jsonb('documents').notNull(),
    signature: jsonb('signature').notNull(),
    sourceWatermark: integer('source_watermark').notNull(),
    modelVersion: text('model_version'),
    promptVersion: text('prompt_version'),
    schemaVersion: integer('schema_version').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.customerId, t.version] }),
    foreignKey({
      columns: [t.workspaceId, t.customerId],
      foreignColumns: [customers.workspaceId, customers.id],
    }),
    check('brain_snapshots_version_check', sql`version > 0`),
  ],
);

/** Historical reference snapshots with observed follow-up outcomes, for the pattern matcher. */
export const referenceCases = pgTable(
  'reference_cases',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid('customer_id').notNull(),
    brainVersion: integer('brain_version').notNull(),
    cutoffAt: ts('cutoff_at').notNull(),
    evidenceAvailableAt: ts('evidence_available_at').notNull(),
    horizonDays: integer('horizon_days').notNull(),
    followupEndAt: ts('followup_end_at').notNull(),
    completeAt: ts('complete_at'),
    observedOutcomes: jsonb('observed_outcomes').notNull().default([]),
    /** True for fixture snapshots reconstructed retrospectively rather than observed live. */
    syntheticReconstruction: boolean('synthetic_reconstruction').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.customerId, t.brainVersion],
      foreignColumns: [
        brainSnapshots.workspaceId,
        brainSnapshots.customerId,
        brainSnapshots.version,
      ],
    }),
    index('reference_cases_cutoff_idx').on(t.workspaceId, t.cutoffAt, t.completeAt),
    check('reference_cases_window_check', sql`evidence_available_at <= cutoff_at`),
  ],
);
