import { JobKind, JobStatus, QueueKind } from '@bob/contracts';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, oneOf, ts, updatedAt } from './columns.js';
import { customers, workspaces } from './tenancy.js';

/**
 * PostgreSQL is the job source of truth; Cloud Tasks only transports `{workspace_id, job_id}`.
 * `lease_token` is a fencing token: every result commit must present the token it claimed with.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid('customer_id'),
    kind: text('kind').notNull(),
    operationKey: text('operation_key').notNull(),
    input: jsonb('input').notNull().default({}),
    result: jsonb('result'),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    availableAt: ts('available_at').notNull().defaultNow(),
    leaseUntil: ts('lease_until'),
    leaseToken: bigint('lease_token', { mode: 'number' }).notNull().default(0),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    finishedAt: ts('finished_at'),
  },
  (t) => [
    unique('jobs_operation_unique').on(t.workspaceId, t.operationKey),
    unique('jobs_workspace_id_unique').on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.customerId],
      foreignColumns: [customers.workspaceId, customers.id],
    }),
    index('jobs_due_idx').on(t.status, t.availableAt),
    index('jobs_customer_idx').on(t.workspaceId, t.customerId, t.createdAt),
    check('jobs_kind_check', oneOf('kind', JobKind.options)),
    check('jobs_status_check', oneOf('status', JobStatus.options)),
  ],
);

/**
 * Transactional outbox: committed with the domain change, then turned into a Cloud Task named
 * deterministically per job/generation. A lost transport gets a new generation, same job.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    jobId: uuid('job_id').notNull(),
    generation: integer('generation').notNull().default(1),
    queue: text('queue').notNull(),
    nextAttemptAt: ts('next_attempt_at').notNull().defaultNow(),
    dispatchedAt: ts('dispatched_at'),
    transportName: text('transport_name'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique('outbox_job_generation_unique').on(t.jobId, t.generation),
    foreignKey({
      columns: [t.workspaceId, t.jobId],
      foreignColumns: [jobs.workspaceId, jobs.id],
    }),
    index('outbox_pending_idx').on(t.dispatchedAt, t.nextAttemptAt),
    check('outbox_queue_check', oneOf('queue', QueueKind.options)),
  ],
);

/** One row per model call: versions, revisions, usage. Never private reasoning or input bodies. */
export const modelRuns = pgTable(
  'model_runs',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid('customer_id'),
    jobId: uuid('job_id').notNull(),
    role: text('role').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    inputRevisions: jsonb('input_revisions').notNull(),
    providerRequestId: text('provider_request_id'),
    durationMs: integer('duration_ms'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    usage: jsonb('usage'),
    outcome: text('outcome').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.jobId],
      foreignColumns: [jobs.workspaceId, jobs.id],
    }),
    check('model_runs_role_check', oneOf('role', ['librarian', 'librarian_query', 'proactor'])),
    check(
      'model_runs_outcome_check',
      oneOf('outcome', ['succeeded', 'invalid_output', 'timeout', 'provider_error', 'cancelled']),
    ),
  ],
);

/** Reserve an upper-bound model budget before inference; settle recorded usage afterwards. */
export const usageReservations = pgTable(
  'usage_reservations',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    jobId: uuid('job_id').notNull(),
    attempt: integer('attempt').notNull(),
    estimatedTokens: integer('estimated_tokens').notNull(),
    settledTokens: integer('settled_tokens'),
    costMicros: bigint('cost_micros', { mode: 'number' }),
    state: text('state').notNull().default('reserved'),
    createdAt: createdAt(),
    settledAt: ts('settled_at'),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.jobId],
      foreignColumns: [jobs.workspaceId, jobs.id],
    }),
    check('usage_reservations_state_check', oneOf('state', ['reserved', 'settled', 'released'])),
  ],
);
