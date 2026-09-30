import { createDatabase } from '@bob/storage';
import { serve } from '@hono/node-server';
import { assertWorkerEnv, loadDotEnv, loadEnv } from '../config/env.js';
import { log } from '../lib/log.js';
import { createWorkerApp } from './app.js';
import { tick } from './dispatcher.js';
import { googleIdTokenVerifier } from './oidc.js';
import { type HandlerRegistry, runJob } from './runner.js';
import { LocalTransport, type TaskTransport } from './transport.js';

loadDotEnv();
const env = loadEnv();
assertWorkerEnv(env);
const database = createDatabase(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  onPoolError: (error) => log.error('db_idle_pool_error', { error: error.name }),
});

// Handlers are registered as each owner lands its module (Librarian, extraction, Proactor,
// delivery). Unregistered kinds remain queued and visible rather than failing.
const handlers: HandlerRegistry = {};

let transport: TaskTransport;
let local: LocalTransport | undefined;
if (env.WORKER_LOCAL_DRIVER) {
  local = new LocalTransport((task) =>
    runJob({ db: database.db, handlers }, task.kind, {
      workspaceId: task.workspaceId,
      jobId: task.jobId,
    }),
  );
  transport = local;
} else {
  transport = {
    enqueue: async () => {
      throw new Error('Cloud Tasks transport is not configured yet');
    },
  };
}

const app = createWorkerApp({
  db: database.db,
  handlers,
  transport,
  invoker: {
    verify: googleIdTokenVerifier(),
    audience: env.WORKER_OIDC_AUDIENCE ?? 'local-driver-no-http-invocation',
    allowedEmails: env.WORKER_INVOKER_EMAILS,
  },
});

const port = env.PORT ?? 3002;
const server = serve({ fetch: app.fetch, port }, (info) => {
  log.info('bob_worker_listening', { port: info.port, local_driver: env.WORKER_LOCAL_DRIVER });
});

// Local driver: the same tick and handler code Scheduler/Tasks would invoke, in-process.
let timer: NodeJS.Timeout | undefined;
if (local) {
  const driver = local;
  let running = false;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick({ db: database.db, handlers, transport });
      await driver.drain();
    } catch (error) {
      log.error('local_tick_failed', { error: error instanceof Error ? error.name : 'unknown' });
    } finally {
      running = false;
    }
  }, env.WORKER_LOCAL_TICK_SECONDS * 1000);
}

const shutdown = () => {
  if (timer) clearInterval(timer);
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
