import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .default(false);

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

/**
 * One validated environment contract for every entrypoint; each process refuses to boot on a bad
 * config. Keys mirror `.env.example`. Secrets arrive from Secret Manager in the cloud.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().optional(),
  /** Runtime login role URL: a member of bob_api (API) or bob_worker (worker). Migrator for jobs/CLI. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  /** HMAC key for API-key hashes. Rotating it invalidates every issued key. */
  API_KEY_PEPPER: z.string().min(32, 'API_KEY_PEPPER must be at least 32 characters'),
  REQUEST_LOG: bool,

  ADMISSION_MUTATIONS_PER_MINUTE: z.coerce.number().int().positive().default(60),
  ADMISSION_READS_PER_MINUTE: z.coerce.number().int().positive().default(120),
  ADMISSION_MODEL_JOBS_PER_MINUTE: z.coerce.number().int().positive().default(20),

  /** Audience expected in Cloud Tasks/Scheduler OIDC tokens (the worker service URL). */
  WORKER_OIDC_AUDIENCE: z.string().optional(),
  /** Service accounts allowed to invoke internal handlers. */
  WORKER_INVOKER_EMAILS: csv,
  /** Local-only: run the clock and task transport in-process instead of Scheduler/Tasks. */
  WORKER_LOCAL_DRIVER: bool,
  WORKER_LOCAL_TICK_SECONDS: z.coerce.number().int().min(1).default(5),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

/** Worker-specific invariants: deployed internal handlers always require Google IAM. */
export function assertWorkerEnv(env: Env): void {
  if (env.NODE_ENV === 'production' && env.WORKER_LOCAL_DRIVER) {
    throw new Error('Invalid environment:\n  WORKER_LOCAL_DRIVER: not allowed in production');
  }
  if (
    !env.WORKER_LOCAL_DRIVER &&
    (!env.WORKER_OIDC_AUDIENCE || env.WORKER_INVOKER_EMAILS.length === 0)
  ) {
    throw new Error(
      'Invalid environment:\n  WORKER_OIDC_AUDIENCE and WORKER_INVOKER_EMAILS are required unless WORKER_LOCAL_DRIVER=true',
    );
  }
}

/** Loads a repo-root or cwd `.env` without overriding real environment values. */
export function loadDotEnv(): void {
  for (const candidate of [
    new URL('.env', `file://${process.cwd()}/`),
    new URL('../../../../.env', import.meta.url),
  ]) {
    try {
      const before = { ...process.env };
      process.loadEnvFile(candidate);
      for (const [key, value] of Object.entries(before)) process.env[key] = value;
      return;
    } catch {
      // not present here; try the next location
    }
  }
}
