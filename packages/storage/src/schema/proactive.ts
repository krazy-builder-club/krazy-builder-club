import { InsightKind, InsightLifecycle, ProposedAction, Weekday } from '@bob/contracts';
import { sql } from 'drizzle-orm';
import {
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
import { createdAt, id, oneOf, ts, updatedAt } from './columns.js';
import { apiKeys, customers, workspaces } from './tenancy.js';
import { jobs } from './work.js';

/** Weekly per-workspace review schedule and its verified webhook destination. */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    creatorKeyId: uuid('creator_key_id').notNull(),
    scopeMode: text('scope_mode').notNull(),
    weekday: text('weekday').notNull().default('monday'),
    localTime: text('local_time').notNull().default('09:00'),
    timezone: text('timezone').notNull(),
    nextRunAt: ts('next_run_at').notNull(),
    state: text('state').notNull().default('pending_verification'),
    active: boolean('active').notNull().default(true),
    webhookUrl: text('webhook_url').notNull(),
    verifiedAt: ts('verified_at'),
    challengeId: text('challenge_id'),
    challengeExpiresAt: ts('challenge_expires_at'),
    /** KMS ciphertext of the signing secret; plaintext is returned once at creation only. */
    signingKeyCiphertext: text('signing_key_ciphertext').notNull(),
    signingKeyVersion: integer('signing_key_version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('subscriptions_workspace_id_unique').on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.creatorKeyId],
      foreignColumns: [apiKeys.workspaceId, apiKeys.id],
    }),
    index('subscriptions_due_idx').on(t.active, t.nextRunAt),
    check('subscriptions_scope_check', oneOf('scope_mode', ['all_active', 'explicit'])),
    check('subscriptions_weekday_check', oneOf('weekday', Weekday.options)),
    check(
      'subscriptions_state_check',
      oneOf('state', ['pending_verification', 'active', 'paused', 'disabled']),
    ),
    check('subscriptions_https_check', sql`webhook_url like 'https://%'`),
  ],
);

export const subscriptionCustomers = pgTable(
  'subscription_customers',
  {
    workspaceId: uuid('workspace_id').notNull(),
    subscriptionId: uuid('subscription_id').notNull(),
    customerId: uuid('customer_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.subscriptionId, t.customerId] }),
    foreignKey({
      columns: [t.workspaceId, t.subscriptionId],
      foreignColumns: [subscriptions.workspaceId, subscriptions.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.customerId],
      foreignColumns: [customers.workspaceId, customers.id],
    }),
  ],
);

/** One persisted occurrence per subscription slot, so duplicate ticks cannot double-send. */
export const reviewOccurrences = pgTable(
  'review_occurrences',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    subscriptionId: uuid('subscription_id').notNull(),
    scheduledFor: ts('scheduled_for').notNull(),
    deadline: ts('deadline').notNull(),
    expectedCount: integer('expected_count').notNull().default(0),
    finishedCount: integer('finished_count').notNull().default(0),
    status: text('status').notNull().default('running'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('review_occurrences_slot_unique').on(t.subscriptionId, t.scheduledFor),
    unique('review_occurrences_workspace_id_unique').on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.subscriptionId],
      foreignColumns: [subscriptions.workspaceId, subscriptions.id],
    }),
    check(
      'review_occurrences_status_check',
      oneOf('status', ['running', 'completed', 'partial', 'skipped', 'failed']),
    ),
  ],
);

export const reviewCustomers = pgTable(
  'review_customers',
  {
    workspaceId: uuid('workspace_id').notNull(),
    reviewId: uuid('review_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    capturedSourceRevision: integer('captured_source_revision').notNull(),
    capturedBrainVersion: integer('captured_brain_version'),
    jobId: uuid('job_id'),
    state: text('state').notNull().default('pending'),
    reason: text('reason'),
  },
  (t) => [
    primaryKey({ columns: [t.reviewId, t.customerId] }),
    foreignKey({
      columns: [t.workspaceId, t.reviewId],
      foreignColumns: [reviewOccurrences.workspaceId, reviewOccurrences.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.customerId],
      foreignColumns: [customers.workspaceId, customers.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.jobId],
      foreignColumns: [jobs.workspaceId, jobs.id],
    }),
    check(
      'review_customers_state_check',
      oneOf('state', ['pending', 'insight', 'no_action', 'stale', 'failed']),
    ),
  ],
);

export const insights = pgTable(
  'insights',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid('customer_id').notNull(),
    brainVersion: integer('brain_version').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    reviewId: uuid('review_id'),
    jobId: uuid('job_id').notNull(),
    kind: text('kind').notNull(),
    candidateNeed: text('candidate_need'),
    horizonDays: integer('horizon_days'),
    action: text('action'),
    explanation: text('explanation'),
    evidence: jsonb('evidence').notNull().default([]),
    cohort: jsonb('cohort'),
    uncertainties: jsonb('uncertainties').notNull().default([]),
    lifecycle: text('lifecycle').notNull().default('pending'),
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('insights_dedupe_unique').on(t.workspaceId, t.dedupeKey),
    unique('insights_workspace_id_unique').on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.customerId],
      foreignColumns: [customers.workspaceId, customers.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.jobId],
      foreignColumns: [jobs.workspaceId, jobs.id],
    }),
    index('insights_customer_idx').on(t.workspaceId, t.customerId, t.lifecycle, t.createdAt),
    check(
      'insights_kind_check',
      oneOf(
        'kind',
        InsightKind.options.filter((k) => k !== 'no_action'),
      ),
    ),
    check(
      'insights_action_check',
      sql`action is null or ${oneOf('action', ProposedAction.options)}`,
    ),
    check('insights_lifecycle_check', oneOf('lifecycle', InsightLifecycle.options)),
  ],
);

/** Frozen per-subscription insight delivery; retries reuse body and delivery ID. */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    subscriptionId: uuid('subscription_id').notNull(),
    insightId: uuid('insight_id').notNull(),
    eventType: text('event_type').notNull().default('insight.created'),
    payloadVersion: text('payload_version').notNull().default('1'),
    body: text('body').notNull(),
    bodySha256: text('body_sha256').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: ts('next_attempt_at'),
    state: text('state').notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('webhook_deliveries_once_unique').on(t.subscriptionId, t.insightId, t.eventType),
    unique('webhook_deliveries_workspace_id_unique').on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.subscriptionId],
      foreignColumns: [subscriptions.workspaceId, subscriptions.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.insightId],
      foreignColumns: [insights.workspaceId, insights.id],
    }),
    check(
      'webhook_deliveries_state_check',
      oneOf('state', ['pending', 'retry_wait', 'delivered', 'failed', 'cancelled']),
    ),
  ],
);

/** Attempt metadata only: never response bodies or secrets. */
export const deliveryAttempts = pgTable(
  'delivery_attempts',
  {
    workspaceId: uuid('workspace_id').notNull(),
    deliveryId: uuid('delivery_id').notNull(),
    attempt: integer('attempt').notNull(),
    startedAt: ts('started_at').notNull(),
    finishedAt: ts('finished_at'),
    destinationCheck: text('destination_check'),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    responseCode: integer('response_code'),
  },
  (t) => [
    primaryKey({ columns: [t.deliveryId, t.attempt] }),
    foreignKey({
      columns: [t.workspaceId, t.deliveryId],
      foreignColumns: [webhookDeliveries.workspaceId, webhookDeliveries.id],
    }),
  ],
);
