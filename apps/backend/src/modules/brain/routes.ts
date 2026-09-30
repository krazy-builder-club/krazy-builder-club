import { randomUUID } from 'node:crypto';
import {
  BRAIN_TREE,
  BrainView,
  DocumentPath,
  JobView,
  type ProfileSignature,
  QueryAccepted,
  QueryRequest,
  type StructuredMemory,
  TERMINAL_JOB_STATUSES,
} from '@bob/contracts';
import {
  type BrainSnapshotRow,
  type CustomerRow,
  type Db,
  enqueueJob,
  getBrainSnapshot,
  getJob,
  recordAudit,
  withWorkspace,
} from '@bob/storage';
import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { AppError, errorResponses } from '../../lib/errors.js';
import { canonicalJson, sha256 } from '../../lib/hash.js';
import { createRouter, iso, requiresApiKey } from '../../lib/router.js';
import {
  type AdmissionLimits,
  type AppEnv,
  type AuthContext,
  admission,
  requireCapability,
  requireCustomer,
} from '../identity/auth.js';
import { idempotent, readIdempotencyKey } from '../identity/idempotency.js';
import { jobView } from '../jobs/routes.js';
import { bundleDocuments } from '../librarian/render.js';

const Params = z.object({ customer_id: z.uuid() });
const Version = z.coerce.number().int().positive().optional();
const MARKDOWN = 'text/markdown; charset=utf-8';
const POLL_INTERVAL_MS = 250;

/** Snapshot rows are immutable, so a (customer, version) pair is a stable validator. */
function brainHeaders(c: Context<AppEnv>, customer: CustomerRow, snapshot: BrainSnapshotRow) {
  const pending = customer.sourceRevision > snapshot.sourceWatermark;
  c.header('ETag', `"brain-${customer.id}-v${snapshot.version}"`);
  c.header('X-BOB-Brain-Version', String(snapshot.version));
  c.header('X-BOB-Pending-Sources', String(pending));
  return pending;
}

/** The requested version or the latest; `brain_not_ready` only when no snapshot exists at all. */
function loadBrain(db: Db, auth: AuthContext, customerId: string, version?: number) {
  return withWorkspace(db, auth.workspaceId, async (tx) => {
    const customer = await requireCustomer(tx, auth, customerId);
    const snapshot = await getBrainSnapshot(tx, customerId, version);
    if (!snapshot) {
      if (version !== undefined && (await getBrainSnapshot(tx, customerId))) {
        throw new AppError('not_found', 404, 'Brain version not found');
      }
      throw new AppError('brain_not_ready', 404, 'No brain exists for this customer yet');
    }
    return { customer, snapshot };
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function brainRoutes(deps: { db: Db; admissionLimits: AdmissionLimits; now?: () => Date }) {
  const app = createRouter<AppEnv>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/customers/{customer_id}/brain',
      tags: ['brain'],
      summary: 'Current or historical brain: structured memory and rendered documents',
      description:
        'JSON by default; `format=markdown` returns all documents as one Markdown bundle. ' +
        '`has_pending_sources` means accepted sources are not yet incorporated.',
      security: requiresApiKey,
      request: {
        params: Params,
        query: z.object({ version: Version, format: z.enum(['json', 'markdown']).default('json') }),
      },
      responses: {
        200: {
          description: 'Brain version',
          content: {
            'application/json': { schema: BrainView },
            'text/markdown': { schema: z.string() },
          },
        },
        ...errorResponses(400, 401, 403, 404, 429),
      },
    }),
    async (c) => {
      const auth = requireCapability(c, 'data:read');
      const { customer_id } = c.req.valid('param');
      const { version, format } = c.req.valid('query');
      const { customer, snapshot } = await loadBrain(deps.db, auth, customer_id, version);
      const pending = brainHeaders(c, customer, snapshot);
      const documents = snapshot.documents as Record<string, string>;
      if (format === 'markdown') {
        c.header('Content-Type', MARKDOWN);
        return c.body(bundleDocuments(documents), 200) as never;
      }
      return c.json(
        {
          customer_id: customer.id,
          version: snapshot.version,
          schema_version: snapshot.schemaVersion,
          source_watermark: snapshot.sourceWatermark,
          current_source_revision: customer.sourceRevision,
          has_pending_sources: pending,
          created_at: iso(snapshot.createdAt),
          tree: BRAIN_TREE.map((f) => ({ folder: f.folder, documents: [...f.documents] })),
          documents,
          structured: snapshot.structured as StructuredMemory,
          signature: snapshot.signature as ProfileSignature,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/customers/{customer_id}/brain/document',
      tags: ['brain'],
      summary: 'One rendered brain document as Markdown',
      description:
        'The path is a query parameter because document paths contain `/`. Same headers as the brain.',
      security: requiresApiKey,
      request: { params: Params, query: z.object({ path: DocumentPath, version: Version }) },
      responses: {
        200: { description: 'Markdown', content: { 'text/markdown': { schema: z.string() } } },
        ...errorResponses(400, 401, 403, 404, 429),
      },
    }),
    async (c) => {
      const auth = requireCapability(c, 'data:read');
      const { customer_id } = c.req.valid('param');
      const { path, version } = c.req.valid('query');
      const { customer, snapshot } = await loadBrain(deps.db, auth, customer_id, version);
      brainHeaders(c, customer, snapshot);
      const text = (snapshot.documents as Record<string, string>)[path];
      if (text === undefined) throw new AppError('not_found', 404, 'Document not found');
      c.header('Content-Type', MARKDOWN);
      return c.body(text, 200) as never;
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/customers/{customer_id}/query',
      tags: ['brain'],
      summary: 'Ask a question grounded in the current brain (asynchronous)',
      description:
        'Queues a read-only query job against the latest brain. With `wait_seconds` the request is ' +
        'held until the job is terminal (`200` with the job) or the wait ends (`202`). Counts ' +
        'against the model admission group. Never changes the brain.',
      security: requiresApiKey,
      request: {
        params: Params,
        headers: z.object({ 'idempotency-key': z.string() }),
        body: { required: true, content: { 'application/json': { schema: QueryRequest } } },
      },
      responses: {
        200: {
          description: 'Finished within the wait',
          content: { 'application/json': { schema: JobView } },
        },
        202: { description: 'Queued', content: { 'application/json': { schema: QueryAccepted } } },
        ...errorResponses(400, 401, 403, 404, 409, 413, 422, 429),
      },
    }),
    async (c) => {
      const auth = requireCapability(c, 'query:run');
      const { customer_id } = c.req.valid('param');
      const body = c.req.valid('json');
      const key = readIdempotencyKey(c.req.header('idempotency-key'), true);
      // The route also spends the shared model budget, on top of the mutation group.
      await admission({ db: deps.db, limits: deps.admissionLimits, now: deps.now }, 'model')(
        c,
        async () => {},
      );

      const result = await idempotent(
        deps.db,
        auth,
        {
          route: 'POST /v1/customers/{id}/query',
          key,
          requestHash: `${customer_id}:${sha256(canonicalJson(body))}`,
        },
        async (tx) => {
          await requireCustomer(tx, auth, customer_id);
          const snapshot = await getBrainSnapshot(tx, customer_id);
          if (!snapshot) {
            throw new AppError('brain_not_ready', 409, 'No brain exists for this customer yet');
          }
          const { job } = await enqueueJob(tx, {
            workspaceId: auth.workspaceId,
            customerId: customer_id,
            kind: 'query',
            operationKey: `query:${randomUUID()}`,
            input: { question: body.question, brain_version: snapshot.version },
          });
          await recordAudit(tx, {
            workspaceId: auth.workspaceId,
            actorType: 'api_key',
            actorId: auth.keyId,
            eventType: 'query.submitted',
            targetId: job.id,
          });
          return {
            status: 202,
            body: { job_id: job.id, status: 'queued', brain_version: snapshot.version },
          };
        },
      );
      const accepted = result.body as QueryAccepted;

      const deadline = Date.now() + body.wait_seconds * 1000;
      while (Date.now() < deadline) {
        await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
        const job = await withWorkspace(deps.db, auth.workspaceId, (tx) =>
          getJob(tx, accepted.job_id),
        );
        if (job && (TERMINAL_JOB_STATUSES as readonly string[]).includes(job.status)) {
          return c.json(jobView(job), 200);
        }
      }
      return c.json(accepted, 202);
    },
  );

  return app;
}
