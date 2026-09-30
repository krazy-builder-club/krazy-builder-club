import { EventAccepted, EventEnvelope, EventView, LIMITS, pageOf } from '@bob/contracts';
import {
  type AppendSourceResult,
  appendSourceEvent,
  type Db,
  getSourceEvent,
  listSourceEvents,
  type SourceEventRow,
  withWorkspace,
} from '@bob/storage';
import { createRoute, z } from '@hono/zod-openapi';
import { AppError, errorResponses, errors } from '../../lib/errors.js';
import { canonicalJson, sha256 } from '../../lib/hash.js';
import { createRouter, decodeCursor, encodeCursor, iso, requiresApiKey } from '../../lib/router.js';
import { type AppEnv, requireCapability, requireCustomer } from '../identity/auth.js';
import { idempotent, readIdempotencyKey } from '../identity/idempotency.js';

export const eventView = (row: SourceEventRow, includePayload: boolean): EventView => ({
  id: row.id,
  customer_id: row.customerId,
  sequence: row.sequence,
  source: row.source,
  source_event_id: row.sourceEventId,
  event_type: row.eventType,
  occurred_at: iso(row.occurredAt),
  received_at: iso(row.receivedAt),
  corrects_event_id: row.correctsEventId,
  file_id: row.fileId,
  ...(includePayload ? { payload: row.payloadText ?? row.payload } : {}),
});

const Params = z.object({ customer_id: z.uuid() });

/** Maps repository outcomes onto the HTTP contract (docs/api.md#intake-envelope). */
function accepted(result: AppendSourceResult) {
  switch (result.status) {
    case 'accepted':
    case 'duplicate':
      return {
        status: 202,
        body: {
          event_id: result.event.id,
          job_id: result.jobId,
          status: 'queued' as const,
          source_revision: result.sourceRevision,
        },
      };
    case 'identity_conflict':
      throw new AppError(
        'source_conflict',
        409,
        'This source identity was already accepted with different content; append a correction instead',
      );
    case 'correction_target_missing':
      throw new AppError(
        'validation_error',
        422,
        'corrects_event_id is not an event of this customer',
      );
    case 'customer_unavailable':
      throw errors.notFound('Customer');
  }
}

export function ingestionRoutes(deps: { db: Db; now?: () => Date }) {
  const app = createRouter<AppEnv>();

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/customers/{customer_id}/events',
      tags: ['ingestion'],
      summary: 'Accept a source event (JSON envelope or text/plain note) and queue the Librarian',
      description:
        'Commits the original source, a customer source revision, a Librarian job and its outbox ' +
        'row atomically. Acceptance is not proof of a brain update. Never triggers the Proactor.',
      security: requiresApiKey,
      request: {
        params: Params,
        headers: z.object({ 'idempotency-key': z.string() }),
        body: {
          required: false,
          content: {
            'application/json': { schema: EventEnvelope },
            'text/plain': { schema: z.string().max(LIMITS.inlineTextBytes) },
          },
        },
      },
      responses: {
        202: {
          description: 'Accepted',
          content: { 'application/json': { schema: EventAccepted } },
        },
        ...errorResponses(400, 401, 403, 404, 409, 413, 415, 422, 429),
      },
    }),
    async (c) => {
      const auth = requireCapability(c, 'sources:write');
      const { customer_id } = c.req.valid('param');
      const key = readIdempotencyKey(c.req.header('idempotency-key'), true);
      const contentType = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase();

      let intake: Parameters<typeof appendSourceEvent>[1];
      if (contentType === 'application/json') {
        const envelope = c.req.valid('json') as EventEnvelope;
        intake = {
          workspaceId: auth.workspaceId,
          customerId: customer_id,
          source: envelope.source,
          sourceEventId: envelope.source_event_id,
          eventType: envelope.event_type,
          occurredAt: new Date(envelope.occurred_at),
          payload: envelope.payload,
          correctsEventId: envelope.corrects_event_id,
          payloadHash: sha256(canonicalJson(envelope)),
        };
      } else if (contentType === 'text/plain') {
        const text = await c.req.text();
        if (Buffer.byteLength(text, 'utf8') > LIMITS.inlineTextBytes) {
          throw new AppError(
            'payload_too_large',
            413,
            'Inline text exceeds 100 KiB; split it or upload a file',
          );
        }
        if (text.trim().length === 0)
          throw new AppError('invalid_envelope', 422, 'Text body is empty');
        // Plain text becomes a `note`, identified by the required Idempotency-Key.
        intake = {
          workspaceId: auth.workspaceId,
          customerId: customer_id,
          source: 'http_text',
          sourceEventId: key as string,
          eventType: 'note',
          occurredAt: deps.now?.() ?? new Date(),
          payloadText: text,
          payloadHash: sha256(text),
        };
      } else {
        throw new AppError(
          'unsupported_media_type',
          415,
          'Inline sources must be application/json or text/plain; use uploads for files',
        );
      }

      const result = await idempotent(
        deps.db,
        auth,
        {
          route: 'POST /v1/customers/{id}/events',
          key,
          requestHash: `${customer_id}:${intake.payloadHash}`,
        },
        async (tx) => {
          await requireCustomer(tx, auth, customer_id);
          return accepted(await appendSourceEvent(tx, intake));
        },
      );
      return c.json(result.body as EventAccepted, 202);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/customers/{customer_id}/events',
      tags: ['ingestion'],
      summary: 'Page through permitted source metadata, optionally with payloads',
      security: requiresApiKey,
      request: {
        params: Params,
        query: z.object({
          cursor: z.string().max(512).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
          include_payload: z.enum(['true', 'false']).default('false'),
        }),
      },
      responses: {
        200: {
          description: 'Page',
          content: { 'application/json': { schema: pageOf(EventView) } },
        },
        ...errorResponses(400, 401, 403, 404, 429),
      },
    }),
    async (c) => {
      const auth = requireCapability(c, 'data:read');
      const { customer_id } = c.req.valid('param');
      const { cursor, limit, include_payload } = c.req.valid('query');
      const after = decodeCursor(cursor, (v) => z.object({ s: z.number().int() }).parse(v));
      if (cursor && !after) throw new AppError('validation_error', 400, 'Invalid cursor');
      const page = await withWorkspace(deps.db, auth.workspaceId, async (tx) => {
        await requireCustomer(tx, auth, customer_id);
        return listSourceEvents(tx, customer_id, { afterSequence: after?.s, limit });
      });
      return c.json(
        {
          items: page.items.map((row) => eventView(row, include_payload === 'true')),
          next_cursor:
            page.nextSequence === undefined ? null : encodeCursor({ s: page.nextSequence }),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/customers/{customer_id}/events/{event_id}',
      tags: ['ingestion'],
      summary: 'Original permitted source payload',
      security: requiresApiKey,
      request: { params: Params.extend({ event_id: z.uuid() }) },
      responses: {
        200: { description: 'Event', content: { 'application/json': { schema: EventView } } },
        ...errorResponses(400, 401, 403, 404, 429),
      },
    }),
    async (c) => {
      const auth = requireCapability(c, 'data:read');
      const { customer_id, event_id } = c.req.valid('param');
      const event = await withWorkspace(deps.db, auth.workspaceId, async (tx) => {
        await requireCustomer(tx, auth, customer_id);
        return getSourceEvent(tx, customer_id, event_id);
      });
      if (!event) throw errors.notFound('Event');
      return c.json(eventView(event, true), 200);
    },
  );

  return app;
}
