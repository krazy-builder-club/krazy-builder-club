import { z } from 'zod';

/**
 * Closed allowlist of worker job kinds. `/internal/jobs/{kind}` rejects anything else, and each
 * kind maps to exactly one queue (docs/architecture.md#durable-work-and-limits).
 */
export const JobKind = z.enum([
  'librarian',
  'extraction',
  'upload_finalize',
  'query',
  'proactor',
  'delivery',
  'webhook_verification',
  'customer_deletion',
]);
export type JobKind = z.infer<typeof JobKind>;

export const QueueKind = z.enum(['memory', 'analysis', 'delivery']);
export type QueueKind = z.infer<typeof QueueKind>;

export const QUEUE_FOR_JOB: Record<JobKind, QueueKind> = {
  librarian: 'memory',
  extraction: 'memory',
  upload_finalize: 'memory',
  customer_deletion: 'memory',
  query: 'analysis',
  proactor: 'analysis',
  delivery: 'delivery',
  webhook_verification: 'delivery',
};

export const JobStatus = z.enum([
  'queued',
  'running',
  'retry_wait',
  'succeeded',
  'failed',
  'cancelled',
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ['succeeded', 'failed', 'cancelled'];

/** The only body an internal job handler accepts; everything else is loaded from PostgreSQL. */
export const InternalJobRequest = z.strictObject({
  workspace_id: z.uuid(),
  job_id: z.uuid(),
});
export type InternalJobRequest = z.infer<typeof InternalJobRequest>;

export const JobView = z.object({
  id: z.uuid(),
  kind: JobKind,
  customer_id: z.uuid().nullable(),
  status: JobStatus,
  attempts: z.number().int(),
  result: z.unknown().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type JobView = z.infer<typeof JobView>;
