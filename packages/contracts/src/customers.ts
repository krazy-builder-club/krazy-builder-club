import { z } from 'zod';
import { JsonValue } from './common.js';

export const CustomerState = z.enum(['active', 'deleting', 'deleted']);
export type CustomerState = z.infer<typeof CustomerState>;

export const CreateCustomer = z.strictObject({
  external_id: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._:-]+$/),
  /** Optional supplied metadata; becomes a `metadata` source event and Librarian job. */
  metadata: z.record(z.string(), JsonValue).optional(),
});
export type CreateCustomer = z.infer<typeof CreateCustomer>;

export const CustomerView = z.object({
  id: z.uuid(),
  external_id: z.string(),
  state: CustomerState,
  source_revision: z.number().int(),
  current_brain_version: z.number().int().nullable(),
  created_at: z.string(),
});
export type CustomerView = z.infer<typeof CustomerView>;

export const CustomerCreated = CustomerView.extend({
  /** Present when metadata was supplied and queued as a source event. */
  metadata_job_id: z.uuid().nullable(),
});
export type CustomerCreated = z.infer<typeof CustomerCreated>;
