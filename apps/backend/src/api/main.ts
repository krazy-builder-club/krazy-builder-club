import { createDatabase } from '@bob/storage';
import { serve } from '@hono/node-server';
import { loadDotEnv, loadEnv } from '../config/env.js';
import { log } from '../lib/log.js';
import { createApiApp } from './app.js';

loadDotEnv();
const env = loadEnv();
const database = createDatabase(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  onPoolError: (error) => log.error('db_idle_pool_error', { error: error.name }),
});

const app = createApiApp({
  db: database.db,
  apiKeyPepper: env.API_KEY_PEPPER,
  requestLog: env.REQUEST_LOG,
  admissionLimits: {
    mutation: env.ADMISSION_MUTATIONS_PER_MINUTE,
    read: env.ADMISSION_READS_PER_MINUTE,
    model: env.ADMISSION_MODEL_JOBS_PER_MINUTE,
  },
});

const port = env.PORT ?? 3000;
const server = serve({ fetch: app.fetch, port }, (info) => {
  log.info('bob_api_listening', { port: info.port });
});

// Cloud Run sends SIGTERM before stopping a revision: stop accepting, drain, close the pool.
const shutdown = () => {
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
