import { randomUUID } from 'node:crypto';
import { LIMITS } from '@bob/contracts';
import { type Db, pingDatabase } from '@bob/storage';
import { createRoute, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { envelope, errorHandler } from '../lib/errors.js';
import { log } from '../lib/log.js';
import { BEARER_SCHEME, createRouter } from '../lib/router.js';
import { customersRoutes } from '../modules/customers/routes.js';
import {
  type AdmissionLimits,
  type AppEnv,
  admission,
  apiKeyAuth,
} from '../modules/identity/auth.js';
import { ingestionRoutes } from '../modules/ingestion/routes.js';
import { jobsRoutes } from '../modules/jobs/routes.js';

export type ApiDeps = {
  db: Db;
  apiKeyPepper: string;
  admissionLimits: AdmissionLimits;
  requestLog?: boolean;
  now?: () => Date;
};

export const openApiInfo = {
  openapi: '3.1.0',
  info: {
    title: 'BOB API',
    version: '0.1.0',
    description:
      'Customer memory and proactive insights. Authenticate with `Authorization: Bearer <api_key>`; ' +
      'the workspace is derived from the key. Errors use `{ error: { code, message, request_id, details? } }`. ' +
      'Canonical contract: docs/api.md.',
  },
};

/**
 * Builds the public API from explicit dependencies. Everything served is mounted here so the
 * generated OpenAPI document and the runtime routes cannot disagree.
 */
export function createApiApp(deps: ApiDeps) {
  const app = createRouter<AppEnv>();
  app.onError(errorHandler);
  app.notFound((c) => c.json(envelope(c, 'not_found', 'Route not found'), 404));

  app.use('*', async (c, next) => {
    const requestId = `req_${randomUUID()}`;
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);
    const started = performance.now();
    await next();
    if (deps.requestLog) {
      log.info('request', {
        request_id: requestId,
        method: c.req.method,
        route: c.req.routePath,
        status: c.res.status,
        duration_ms: Math.round(performance.now() - started),
      });
    }
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/health/live',
      tags: ['health'],
      summary: 'Process liveness; no customer content',
      responses: {
        200: {
          description: 'Alive',
          content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
        },
      },
    }),
    (c) => c.json({ ok: true as const }, 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/health/ready',
      tags: ['health'],
      summary: 'Database reachability; never calls the model',
      responses: {
        200: {
          description: 'Ready',
          content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
        },
        503: {
          description: 'Database unavailable',
          content: { 'application/json': { schema: z.object({ ok: z.literal(false) }) } },
        },
      },
    }),
    async (c) =>
      (await pingDatabase(deps.db))
        ? c.json({ ok: true as const }, 200)
        : c.json({ ok: false as const }, 503),
  );

  app.use('/v1/*', bodyLimit({ maxSize: LIMITS.jsonRequestBytes }));
  app.use('/v1/*', apiKeyAuth({ db: deps.db, pepper: deps.apiKeyPepper, now: deps.now }));
  const limits = { db: deps.db, limits: deps.admissionLimits, now: deps.now };
  app.on(['POST', 'PATCH', 'DELETE'], '/v1/*', admission(limits, 'mutation'));
  app.on('GET', '/v1/*', admission(limits, 'read'));

  app.route('/', customersRoutes(deps));
  app.route('/', ingestionRoutes(deps));
  app.route('/', jobsRoutes(deps));

  app.openAPIRegistry.registerComponent('securitySchemes', BEARER_SCHEME, {
    type: 'http',
    scheme: 'bearer',
    description: 'Workspace API key issued by the operator CLI; shown once at creation.',
  });
  app.doc31('/openapi.json', openApiInfo);

  return app;
}

export type ApiApp = ReturnType<typeof createApiApp>;
