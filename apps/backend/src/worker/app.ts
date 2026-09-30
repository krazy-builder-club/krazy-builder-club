import { InternalJobRequest, JobKind } from '@bob/contracts';
import { type Db, pingDatabase } from '@bob/storage';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { tick } from './dispatcher.js';
import { type IdTokenVerifier, requireInvoker } from './oidc.js';
import { type HandlerRegistry, runJob } from './runner.js';
import type { TaskTransport } from './transport.js';

export type WorkerDeps = {
  db: Db;
  handlers: HandlerRegistry;
  transport: TaskTransport;
  invoker: { verify: IdTokenVerifier; audience: string; allowedEmails: readonly string[] };
};

/**
 * IAM-only worker surface. `/internal/jobs/{kind}` accepts a closed kind allowlist and only
 * `{workspace_id, job_id}`; everything else is loaded from PostgreSQL and re-validated.
 */
export function createWorkerApp(deps: WorkerDeps) {
  const app = new Hono();

  app.get('/health/live', (c) => c.json({ ok: true }));
  app.get('/health/ready', async (c) =>
    (await pingDatabase(deps.db)) ? c.json({ ok: true }) : c.json({ ok: false }, 503),
  );

  app.use('/internal/*', bodyLimit({ maxSize: 4 * 1024 }));
  app.use('/internal/*', requireInvoker(deps.invoker));

  app.post('/internal/tick', async (c) => c.json(await tick(deps)));

  app.post('/internal/jobs/:kind', async (c) => {
    const kind = JobKind.safeParse(c.req.param('kind'));
    const body = InternalJobRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!kind.success || !body.success) {
      return c.json(
        { error: { code: 'validation_error', message: 'Unknown job kind or body' } },
        400,
      );
    }
    const outcome = await runJob(deps, kind.data, {
      workspaceId: body.data.workspace_id,
      jobId: body.data.job_id,
    });
    // Always 2xx once handled: durable retries are scheduled through the outbox, so a
    // transport-level retry would only produce a harmless duplicate.
    return c.json({ outcome });
  });

  return app;
}
