-- Runtime roles, forced row-level security and narrow cross-tenant functions (docs/data.md#authorization).
--
-- bob_api / bob_worker are NOLOGIN group roles. Deployment grants them to login users (Cloud SQL IAM
-- users in the cloud; local roles in development/tests). Neither is a table owner or BYPASSRLS, so
-- every tenant table is visible only for the transaction-local `app.workspace_id`.
-- bob_system owns the SECURITY DEFINER functions below and is never granted to a login role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bob_api') THEN
    CREATE ROLE bob_api NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bob_worker') THEN
    CREATE ROLE bob_worker NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bob_system') THEN
    CREATE ROLE bob_system NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

-- The migrator must be a member of bob_system to hand it function ownership.
GRANT bob_system TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO bob_api, bob_worker, bob_system;

-- Transaction-local tenant context. NULL (no context) matches no rows.
CREATE FUNCTION public.bob_current_workspace() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $$;

-- Forced RLS on every tenant table; FORCE also binds the table owner (the migrator/operator).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'api_keys', 'customers', 'api_key_customers', 'idempotency_records', 'admission_windows',
    'audit_events', 'files', 'source_events', 'brain_snapshots', 'reference_cases', 'jobs',
    'outbox', 'model_runs', 'usage_reservations', 'subscriptions', 'subscription_customers',
    'review_occurrences', 'review_customers', 'insights', 'webhook_deliveries', 'delivery_attempts'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I USING (workspace_id = public.bob_current_workspace()) '
      'WITH CHECK (workspace_id = public.bob_current_workspace())', t);
  END LOOP;
END $$;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.workspaces
  USING (id = public.bob_current_workspace())
  WITH CHECK (id = public.bob_current_workspace());

-- bob_system's cross-workspace reach is limited to identity lookup and operational job transport.
CREATE POLICY system_key_lookup ON public.api_keys FOR SELECT TO bob_system USING (true);
CREATE POLICY system_key_lookup ON public.workspaces FOR SELECT TO bob_system USING (true);
CREATE POLICY system_transport ON public.outbox TO bob_system USING (true) WITH CHECK (true);
CREATE POLICY system_transport ON public.jobs FOR SELECT TO bob_system USING (true);
CREATE POLICY system_reconcile ON public.jobs FOR UPDATE TO bob_system USING (true) WITH CHECK (true);

GRANT SELECT ON public.workspaces, public.api_keys TO bob_system;
GRANT SELECT, UPDATE ON public.jobs TO bob_system;
GRANT SELECT, INSERT, UPDATE ON public.outbox TO bob_system;

-- API: intake, reads, feedback and subscription management. No brain/model/reference writes.
GRANT SELECT ON public.workspaces, public.api_keys, public.api_key_customers TO bob_api;
GRANT SELECT, INSERT, UPDATE ON
  public.customers, public.source_events, public.files, public.jobs, public.outbox,
  public.idempotency_records, public.admission_windows, public.subscriptions,
  public.subscription_customers, public.insights, public.webhook_deliveries
  TO bob_api;
GRANT DELETE ON public.subscription_customers, public.idempotency_records TO bob_api;
GRANT SELECT ON
  public.brain_snapshots, public.reference_cases, public.review_occurrences,
  public.review_customers, public.delivery_attempts, public.model_runs
  TO bob_api;
GRANT INSERT ON public.audit_events TO bob_api;

-- Worker: scoped processing tables, plus deletes for durable customer deletion.
GRANT SELECT ON public.workspaces, public.api_keys, public.api_key_customers TO bob_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.customers, public.source_events, public.files, public.brain_snapshots,
  public.reference_cases, public.jobs, public.outbox, public.model_runs,
  public.usage_reservations, public.subscriptions, public.subscription_customers,
  public.review_occurrences, public.review_customers, public.insights,
  public.webhook_deliveries, public.delivery_attempts
  TO bob_worker;
GRANT INSERT ON public.audit_events TO bob_worker;

-- API-key lookup by exact HMAC hash: identity/scope metadata only, never customer data.
CREATE FUNCTION public.bob_lookup_api_key(p_key_hash text)
  RETURNS TABLE (
    key_id uuid, workspace_id uuid, capabilities text[], all_customers boolean,
    expires_at timestamptz, revoked_at timestamptz, workspace_state text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT k.id, k.workspace_id, k.capabilities, k.all_customers, k.expires_at, k.revoked_at, w.state
    FROM public.api_keys k JOIN public.workspaces w ON w.id = k.workspace_id
    WHERE k.key_hash = p_key_hash
  $$;

-- Claim due outbox rows for the given job kinds. The claim pushes next_attempt_at forward so a
-- concurrent or crashed dispatcher's rows become claimable again after p_claim_seconds.
CREATE FUNCTION public.bob_claim_outbox(p_kinds text[], p_limit integer, p_claim_seconds integer)
  RETURNS TABLE (outbox_id uuid, workspace_id uuid, job_id uuid, generation integer, queue text, kind text)
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    WITH due AS (
      SELECT o.id, j.kind
      FROM public.outbox o JOIN public.jobs j ON j.id = o.job_id
      WHERE o.dispatched_at IS NULL AND o.next_attempt_at <= now() AND j.kind = ANY (p_kinds)
      ORDER BY o.next_attempt_at
      LIMIT p_limit
      FOR UPDATE OF o SKIP LOCKED
    ), claimed AS (
      UPDATE public.outbox o
      SET attempts = o.attempts + 1, next_attempt_at = now() + make_interval(secs => p_claim_seconds)
      FROM due WHERE o.id = due.id
      RETURNING o.id, o.workspace_id, o.job_id, o.generation, o.queue, due.kind
    )
    SELECT * FROM claimed
  $$;

CREATE FUNCTION public.bob_mark_outbox_dispatched(p_outbox_id uuid, p_transport_name text)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    UPDATE public.outbox SET dispatched_at = now(), transport_name = p_transport_name
    WHERE id = p_outbox_id AND dispatched_at IS NULL
  $$;

-- Expired leases: requeue with a new outbox generation, or fail once attempts are exhausted.
CREATE FUNCTION public.bob_reconcile_expired_leases(p_limit integer)
  RETURNS integer
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    WITH expired AS (
      SELECT id FROM public.jobs
      WHERE status = 'running' AND lease_until < now()
      ORDER BY lease_until LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    ), updated AS (
      UPDATE public.jobs j SET
        status = CASE WHEN j.attempts >= j.max_attempts THEN 'failed' ELSE 'retry_wait' END,
        error_code = CASE WHEN j.attempts >= j.max_attempts THEN 'lease_expired' ELSE j.error_code END,
        error_message = CASE WHEN j.attempts >= j.max_attempts THEN 'Worker lease expired' ELSE j.error_message END,
        finished_at = CASE WHEN j.attempts >= j.max_attempts THEN now() ELSE NULL END,
        available_at = now(), lease_until = NULL, updated_at = now()
      FROM expired e WHERE j.id = e.id
      RETURNING j.id, j.workspace_id, j.status
    ), requeued AS (
      INSERT INTO public.outbox (workspace_id, job_id, generation, queue)
      SELECT u.workspace_id, u.id, last.generation + 1, last.queue
      FROM updated u
      CROSS JOIN LATERAL (
        SELECT o.generation, o.queue FROM public.outbox o
        WHERE o.job_id = u.id ORDER BY o.generation DESC LIMIT 1
      ) last
      WHERE u.status = 'retry_wait'
      RETURNING 1
    )
    SELECT count(*)::integer FROM updated
  $$;

-- Lost transport: dispatched long ago but the job never started. Issue a new generation.
CREATE FUNCTION public.bob_reconcile_lost_dispatches(p_stale_seconds integer, p_limit integer)
  RETURNS integer
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    WITH latest AS (
      SELECT DISTINCT ON (o.job_id) o.id, o.workspace_id, o.job_id, o.generation, o.queue, o.dispatched_at
      FROM public.outbox o JOIN public.jobs j ON j.id = o.job_id
      WHERE j.status IN ('queued', 'retry_wait') AND j.available_at <= now()
      ORDER BY o.job_id, o.generation DESC
    ), lost AS (
      SELECT * FROM latest
      WHERE dispatched_at IS NOT NULL AND dispatched_at < now() - make_interval(secs => p_stale_seconds)
      LIMIT p_limit
    ), inserted AS (
      INSERT INTO public.outbox (workspace_id, job_id, generation, queue)
      SELECT workspace_id, job_id, generation + 1, queue FROM lost
      ON CONFLICT (job_id, generation) DO NOTHING
      RETURNING 1
    )
    SELECT count(*)::integer FROM inserted
  $$;

REVOKE ALL ON FUNCTION
  public.bob_lookup_api_key(text),
  public.bob_claim_outbox(text[], integer, integer),
  public.bob_mark_outbox_dispatched(uuid, text),
  public.bob_reconcile_expired_leases(integer),
  public.bob_reconcile_lost_dispatches(integer, integer)
  FROM PUBLIC;

-- A new function owner needs CREATE on the schema; grant it only for the transfer.
GRANT CREATE ON SCHEMA public TO bob_system;
ALTER FUNCTION public.bob_lookup_api_key(text) OWNER TO bob_system;
ALTER FUNCTION public.bob_claim_outbox(text[], integer, integer) OWNER TO bob_system;
ALTER FUNCTION public.bob_mark_outbox_dispatched(uuid, text) OWNER TO bob_system;
ALTER FUNCTION public.bob_reconcile_expired_leases(integer) OWNER TO bob_system;
ALTER FUNCTION public.bob_reconcile_lost_dispatches(integer, integer) OWNER TO bob_system;
REVOKE CREATE ON SCHEMA public FROM bob_system;

GRANT EXECUTE ON FUNCTION public.bob_lookup_api_key(text) TO bob_api, bob_worker;
GRANT EXECUTE ON FUNCTION
  public.bob_claim_outbox(text[], integer, integer),
  public.bob_mark_outbox_dispatched(uuid, text),
  public.bob_reconcile_expired_leases(integer),
  public.bob_reconcile_lost_dispatches(integer, integer)
  TO bob_worker;
