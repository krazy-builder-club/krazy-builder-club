import { z } from 'zod';
import { JsonValue, UtcInstant } from './common.js';

/** Initial caps (docs/architecture.md#ingestion-and-librarian). Reject, never silently truncate. */
export const LIMITS = {
  jsonRequestBytes: 1024 * 1024,
  inlineTextBytes: 100 * 1024,
  uploadBytes: 20 * 1024 * 1024,
  pdfPages: 50,
  extractedTextBytesPerJob: 200 * 1024,
} as const;

/** Known event types; unknown values are retained as generic supplied information. */
export const KNOWN_EVENT_TYPES = [
  'note',
  'transaction',
  'metadata',
  'correction',
  'attachment',
  'feedback',
  'outcome',
] as const;

const Token = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/, 'letters, digits and . _ : - only');

/**
 * Intake envelope. `payload` is any bounded JSON value, preserved as supplied. Server-owned
 * fields (`received_at`, workspace, sequence, source revision) are never accepted from clients.
 */
export const EventEnvelope = z.strictObject({
  source: Token,
  source_event_id: Token,
  event_type: Token,
  occurred_at: UtcInstant,
  payload: JsonValue.refine((v) => v !== null, 'payload must not be null'),
  corrects_event_id: z.uuid().optional(),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

export const EventAccepted = z.object({
  event_id: z.uuid(),
  job_id: z.uuid(),
  status: z.literal('queued'),
  source_revision: z.number().int(),
});
export type EventAccepted = z.infer<typeof EventAccepted>;

export const EventView = z.object({
  id: z.uuid(),
  customer_id: z.uuid(),
  sequence: z.number().int(),
  source: z.string(),
  source_event_id: z.string(),
  event_type: z.string(),
  occurred_at: z.string(),
  received_at: z.string(),
  corrects_event_id: z.uuid().nullable(),
  file_id: z.uuid().nullable(),
  payload: z.unknown().optional(),
});
export type EventView = z.infer<typeof EventView>;
