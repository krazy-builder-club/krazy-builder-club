import { type Capability, type JobKind, JobView } from '@bob/contracts';
import { type Db, getJob, type JobRow, withWorkspace } from '@bob/storage';
import { createRoute, z } from '@hono/zod-openapi';
import { errorResponses, errors } from '../../lib/errors.js';
import { createRouter, iso, requiresApiKey } from '../../lib/router.js';
import { type AppEnv, requireCustomer } from '../identity/auth.js';

/** Job access inherits the capability of the operation that created it (docs/api.md). */
const CAPABILITY_FOR_JOB: Record<JobKind, Capability> = {
  librarian: 'sources:write',
  extraction: 'sources:write',
  upload_finalize: 'sources:write',
  query: 'query:run',
  proactor: 'evaluate:run',
  customer_deletion: 'customers:write',
  delivery: 'subscriptions:manage',
  webhook_verification: 'subscriptions:manage',
};

export const jobView = (row: JobRow): JobView => ({
  id: row.id,
  kind: row.kind as JobKind,
  customer_id: row.customerId,
  status: row.status as JobView['status'],
  attempts: row.attempts,
  result: row.result ?? null,
  // Stored messages are already scrubbed codes/summaries, never provider or input text.
  error: row.errorCode ? { code: row.errorCode, message: row.errorMessage ?? '' } : null,
  created_at: iso(row.createdAt),
  updated_at: iso(row.updatedAt),
});

export function jobsRoutes(deps: { db: Db }) {
  const app = createRouter<AppEnv>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/jobs/{job_id}',
      tags: ['jobs'],
      summary: 'Job state, attempts, result references and scrubbed error',
      security: requiresApiKey,
      request: { params: z.object({ job_id: z.uuid() }) },
      responses: {
        200: { description: 'Job', content: { 'application/json': { schema: JobView } } },
        ...errorResponses(400, 401, 404, 429),
      },
    }),
    async (c) => {
      const auth = c.get('auth');
      const { job_id } = c.req.valid('param');
      const job = await withWorkspace(deps.db, auth.workspaceId, async (tx) => {
        const row = await getJob(tx, job_id);
        if (!row) return undefined;
        // Missing capability or customer grant looks exactly like a missing job.
        if (!auth.capabilities.has(CAPABILITY_FOR_JOB[row.kind as JobKind])) return undefined;
        if (row.customerId) await requireCustomer(tx, auth, row.customerId);
        return row;
      }).catch((error: unknown) => {
        if (error instanceof Error && 'status' in error && error.status === 404) return undefined;
        throw error;
      });
      if (!job) throw errors.notFound('Job');
      return c.json(jobView(job), 200);
    },
  );

  return app;
}
