export * from './memory.js';
export * from './proactive.js';
export * from './tenancy.js';
export * from './work.js';

/**
 * Every table that carries `workspace_id` and must have forced row-level security. The RLS
 * migration and its test both check against this list, so a new tenant table cannot silently
 * ship without a policy.
 */
export const TENANT_TABLES = [
  'api_keys',
  'customers',
  'api_key_customers',
  'idempotency_records',
  'admission_windows',
  'audit_events',
  'files',
  'source_events',
  'brain_snapshots',
  'reference_cases',
  'jobs',
  'outbox',
  'model_runs',
  'usage_reservations',
  'subscriptions',
  'subscription_customers',
  'review_occurrences',
  'review_customers',
  'insights',
  'webhook_deliveries',
  'delivery_attempts',
] as const;
