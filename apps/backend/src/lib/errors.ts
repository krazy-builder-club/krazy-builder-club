import type { ErrorCode } from '@bob/contracts';
import type { Hook } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import type { Context, Env, ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { log } from './log.js';

export const ErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'not_found' }),
      message: z.string(),
      request_id: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi('ErrorEnvelope');

/** A domain error rendered as the shared envelope. 5xx never carry internal detail. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: ContentfulStatusCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  unauthenticated: () => new AppError('unauthenticated', 401, 'A valid API key is required'),
  forbidden: () => new AppError('forbidden', 403, 'This key lacks the required capability'),
  notFound: (what: string) => new AppError('not_found', 404, `${what} not found`),
  idempotencyRequired: () =>
    new AppError('idempotency_key_required', 400, 'This route requires an Idempotency-Key header'),
  idempotencyConflict: () =>
    new AppError(
      'idempotency_conflict',
      409,
      'Idempotency-Key was already used with a different request',
    ),
  rateLimited: () => new AppError('rate_limited', 429, 'Workspace admission limit reached'),
};

export const requestId = (c: Context) =>
  (c.get('requestId' as never) as string | undefined) ?? 'unknown';

export function envelope(c: Context, code: string, message: string, details?: unknown) {
  return {
    error: {
      code,
      message,
      request_id: requestId(c),
      ...(details === undefined ? {} : { details }),
    },
  };
}

/** JSON bodies failing their schema are `422 invalid_envelope`; params/query are `400`. */
export const validationHook = <E extends Env>(
  result: Parameters<Hook<unknown, E, string, unknown>>[0],
  c: Context<E>,
): Response | undefined => {
  if (result.success) return undefined;
  const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  return result.target === 'json'
    ? c.json(envelope(c, 'invalid_envelope', 'Request body failed validation', issues), 422)
    : c.json(envelope(c, 'validation_error', 'Request failed validation', issues), 400);
};

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError)
    return c.json(envelope(c, err.code, err.message, err.details), err.status);
  const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;
  if (status === 413)
    return c.json(envelope(c, 'payload_too_large', 'Request body too large'), 413);
  if (status >= 500) {
    // Log the class and request only; exception text may contain input fragments.
    log.error('unhandled_error', {
      request_id: requestId(c),
      error: err.name,
      path: c.req.routePath,
    });
    return c.json(envelope(c, 'internal_error', 'Something went wrong'), 500);
  }
  return c.json(
    envelope(c, 'validation_error', 'Malformed request'),
    status as ContentfulStatusCode,
  );
};

export const errorResponses = (
  ...statuses: (400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429)[]
) =>
  Object.fromEntries(
    statuses.map((status) => [
      status,
      {
        description: {
          400: 'Invalid parameters or missing required header',
          401: 'Missing, invalid, expired or revoked API key',
          403: 'Key lacks the required capability',
          404: 'Not found or not permitted for this key',
          409: 'Conflict',
          413: 'Body exceeds the bounded size',
          415: 'Unsupported inline content type',
          422: 'Invalid envelope',
          429: 'Workspace admission limit reached',
        }[status],
        content: { 'application/json': { schema: ErrorEnvelopeSchema } },
      },
    ]),
  );
