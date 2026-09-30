import { z } from 'zod';

/** Server-generated opaque identifier (UUID on the wire; clients must not parse it). */
export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

/** RFC 3339 UTC instant, e.g. `2026-10-01T08:00:00Z`. */
export const UtcInstant = z.iso.datetime({ offset: false });

/** Data provenance label carried on workspaces and outbound payloads; MVP is synthetic-only. */
export const DataKind = z.enum(['synthetic']);
export type DataKind = z.infer<typeof DataKind>;

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((v) => isJsonValue(v, depth + 1));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.values(value).every((v) => isJsonValue(v, depth + 1));
  }
  return false;
}

/**
 * Any JSON value (bounded nesting), preserved as supplied. Deliberately not `z.json()`: its
 * recursive lazy schema sends OpenAPI generation into unbounded recursion.
 */
export const JsonValue = z
  .unknown()
  .refine((v) => v !== undefined && isJsonValue(v), 'must be a JSON value (max depth 64)');

/** Money as integer minor units plus ISO 4217 currency (docs/api.md common rules). */
export const Money = z.object({
  amount_minor: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

/** Stable error codes the API may return. Unknown failures are always `internal_error`. */
export const ErrorCode = z.enum([
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_error',
  'invalid_envelope',
  'idempotency_key_required',
  'idempotency_conflict',
  'customer_exists',
  'source_conflict',
  'brain_not_ready',
  'payload_too_large',
  'unsupported_media_type',
  'rate_limited',
  'unavailable',
  'internal_error',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** The one error envelope every route speaks (docs/api.md). */
export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

/** Cursor pagination: default 20, maximum 100. */
export const PageQuery = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), next_cursor: z.string().nullable() });
