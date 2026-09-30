import { CreateCustomer, CustomerCreated, CustomerView, PageQuery, pageOf } from '@bob/contracts';
import {
  appendSourceEvent,
  type CustomerRow,
  commitBrainSnapshot,
  type Db,
  findCustomerByExternalId,
  insertCustomer,
  listCustomers,
  recordAudit,
  withWorkspace,
} from '@bob/storage';
import { createRoute, z } from '@hono/zod-openapi';
import { AppError, errorResponses, errors } from '../../lib/errors.js';
import { canonicalJson, sha256 } from '../../lib/hash.js';
import { createRouter, decodeCursor, encodeCursor, iso, requiresApiKey } from '../../lib/router.js';
import { type AppEnv, requireCapability, requireCustomer } from '../identity/auth.js';
import { idempotent, readIdempotencyKey } from '../identity/idempotency.js';
import { skeletonSnapshot } from '../librarian/skeleton.js';

export const customerView = (row: CustomerRow): CustomerView => ({
  id: row.id,
  external_id: row.externalId,
  state: row.state as CustomerView['state'],
  source_revision: row.sourceRevision,
  current_brain_version: row.currentBrainVersion,
  created_at: iso(row.createdAt),
});

const CustomerId = z.object({ customer_id: z.uuid() });
const CursorShape = z.object({ t: z.string().max(64), id: z.uuid() });

export function customersRoutes(deps: { db: Db }) {
  const app = createRouter<AppEnv>();

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/customers',
      tags: ['customers'],
      summary: 'Create a customer (workspace-wide key); optional metadata becomes a source event',
      security: requiresApiKey,
      request: {
        headers: z.object({ 'idempotency-key': z.string().optional() }),
        body: { required: true, content: { 'application/json': { schema: CreateCustomer } } },
      },
      responses: {
        201: {
          description: 'Created',
          content: { 'application/json': { schema: CustomerCreated } },
        },
        ...errorResponses(400, 401, 403, 409, 413, 422, 429),
      },
    }),
    async (c) => {
      const auth = requireCapability(c, 'customers:write');
      if (!auth.grant.allCustomers) throw errors.forbidden();
      const body = c.req.valid('json');
      const key = readIdempotencyKey(c.req.header('idempotency-key'), false);
      const result = await idempotent(
        deps.db,
        auth,
        { route: 'POST /v1/customers', key, requestHash: sha256(canonicalJson(body)) },
        async (tx) => {
          const customer = await insertCustomer(tx, {
            workspaceId: auth.workspaceId,
            externalId: body.external_id,
          });
          if (!customer) {
            const existing = await findCustomerByExternalId(tx, body.external_id);
            throw new AppError(
              'customer_exists',
              409,
              'external_id already exists in this workspace',
              {
                customer_id: existing?.id,
              },
            );
          }
          // Commit the empty brain atomically, before any source can advance the revision.
          const skeleton = skeletonSnapshot(auth.workspaceId, customer.id, customer.createdAt);
          if (!(await commitBrainSnapshot(tx, skeleton))) throw new Error('skeleton not committed');
          let metadataJobId: string | null = null;
          let current: CustomerRow = { ...customer, currentBrainVersion: 1 };
          if (body.metadata) {
            const accepted = await appendSourceEvent(tx, {
              workspaceId: auth.workspaceId,
              customerId: customer.id,
              source: 'bob_api',
              sourceEventId: 'customer_create_metadata',
              eventType: 'metadata',
              occurredAt: customer.createdAt,
              payload: body.metadata,
              payloadHash: sha256(canonicalJson(body.metadata)),
            });
            if (accepted.status !== 'accepted')
              throw new Error(`metadata intake ${accepted.status}`);
            metadataJobId = accepted.jobId;
            current = { ...customer, sourceRevision: accepted.sourceRevision };
          }
          await recordAudit(tx, {
            workspaceId: auth.workspaceId,
            actorType: 'api_key',
            actorId: auth.keyId,
            eventType: 'customer.created',
            targetId: customer.id,
          });
          return {
            status: 201,
            body: { ...customerView(current), metadata_job_id: metadataJobId },
          };
        },
      );
      return c.json(result.body as CustomerCreated, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/customers',
      tags: ['customers'],
      summary: 'List active customers this key may access, optionally by exact external_id',
      security: requiresApiKey,
      request: { query: PageQuery.extend({ external_id: z.string().min(1).max(200).optional() }) },
      responses: {
        200: {
          description: 'Page',
          content: { 'application/json': { schema: pageOf(CustomerView) } },
        },
        ...errorResponses(400, 401, 403, 429),
      },
    }),
    async (c) => {
      const auth = requireCapability(c, 'data:read');
      const { cursor, limit, external_id } = c.req.valid('query');
      const after = decodeCursor(cursor, (v) => CursorShape.parse(v));
      if (cursor && !after) throw new AppError('validation_error', 400, 'Invalid cursor');
      const page = await withWorkspace(deps.db, auth.workspaceId, (tx) =>
        listCustomers(tx, auth.grant, {
          limit,
          externalId: external_id,
          after: after && { createdAt: after.t, id: after.id },
        }),
      );
      return c.json(
        {
          items: page.items.map(customerView),
          next_cursor: page.next
            ? encodeCursor({ t: page.next.createdAt, id: page.next.id })
            : null,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/customers/{customer_id}',
      tags: ['customers'],
      summary: 'Customer identity and processing state',
      security: requiresApiKey,
      request: { params: CustomerId },
      responses: {
        200: { description: 'Customer', content: { 'application/json': { schema: CustomerView } } },
        ...errorResponses(400, 401, 403, 404, 429),
      },
    }),
    async (c) => {
      const auth = requireCapability(c, 'data:read');
      const { customer_id } = c.req.valid('param');
      const customer = await withWorkspace(deps.db, auth.workspaceId, (tx) =>
        requireCustomer(tx, auth, customer_id),
      );
      return c.json(customerView(customer), 200);
    },
  );

  return app;
}
