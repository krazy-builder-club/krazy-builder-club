-- ADR 0008: customer creation commits the deterministic empty brain (version 1) atomically, so
-- the API may insert exactly that skeleton and nothing else. Model-derived snapshots remain
-- worker-only. RESTRICTIVE policies are AND-ed with tenant isolation, so this narrows the grant.
GRANT INSERT ON public.brain_snapshots TO bob_api;
--> statement-breakpoint
CREATE POLICY api_skeleton_only ON public.brain_snapshots AS RESTRICTIVE FOR INSERT TO bob_api
  WITH CHECK (
    version = 1 AND base_version IS NULL AND source_watermark = 0
    AND model_version IS NULL AND prompt_version = 'skeleton'
  );
