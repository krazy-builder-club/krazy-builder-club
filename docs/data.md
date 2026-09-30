# Data Architecture

Database design, implemented in `packages/storage` (Drizzle schema, `drizzle/0000_init.sql`, `drizzle/0001_security.sql`, `drizzle/0002_brain_skeleton.sql`). Tables exist in migrations; brains and model runs are written by the Librarian, while later-phase tables (references, insights, subscriptions, deliveries) have no application code yet. Stack/execution choices live in [architecture](architecture.md); wire formats in [API](api.md). Storage owns every table once.

## Sources of Truth

Cloud SQL PostgreSQL 17 holds ownership, source metadata/inline content, structured memory, Markdown, historical references, jobs, schedules and delivery state. GCS holds original file bytes, referenced by exact object generation. No database per customer and no live Markdown files in Git.

Raw sources are append-only except explicit deletion/retention operations. Corrections are new sources referring to prior evidence. Structured memory is canonical; deterministic rendering creates its Markdown documents in the same snapshot transaction. Reference signatures link to a brain version rather than drifting independently.

Every customer record has `workspace_id`; each dependent customer table uses composite foreign keys `(workspace_id, customer_id)` to prevent cross-tenant joins. IDs are server-generated opaque UUIDs. Store timestamps as UTC `timestamptz`, money as integer minor units with currency, and payloads as JSONB. Domain/status vocabularies are validated by shared schemas and database checks.

## Physical Table Design

Fields below define key responsibilities and constraints; migrations may add audit/index columns without changing meaning.

| Table | Key fields and constraints |
|---|---|
| `workspaces` | `id`, name, `data_kind`, state, configuration; synthetic-only for MVP |
| `api_keys` | workspace, key ID/prefix/hash, capabilities, all-customer flag, expiry, revoked_at; no plaintext token |
| `api_key_customers` | workspace/key/customer grant; unique key/customer; composite scoped FKs |
| `customers` | workspace/id, external_id, active/deleting/deleted state, reference eligibility, source_revision, current_brain_version; unique workspace/external_id |
| `source_events` | workspace/customer/id, sequence, kind, source/source_event_id, occurred_at, received_at, raw JSON/text or file_id, payload hash, correction target; unique workspace/customer/source/source_event_id; unique customer sequence |
| `files` | workspace/customer/id, random object key, pinned generation, MIME, actual bytes/hash, state, extraction status/result; generation fixed at finalization |
| `brain_snapshots` | workspace/customer/version, base_version, structured memory JSONB, documents JSONB, signature JSONB, source_watermark/revision, model/prompt/schema versions, created_at; unique customer/version |
| `reference_cases` | workspace/customer/id, brain_version, cutoff_at, evidence_available_at, horizon_days, followup_end_at, complete_at, observed_outcomes JSONB; scoped snapshot FK |
| `jobs` | workspace/customer when applicable, kind, operation_key, input/result refs, status, attempts, available_at, lease_until/token, timestamps, scrubbed error; unique workspace/operation_key |
| `outbox` | workspace/job, generation, queue kind, next_attempt_at, dispatched_at, transport name, attempts; unique job/generation |
| `model_runs` | workspace/customer/job, role, model/prompt/schema versions, input revisions, provider request ID, duration, tokens, usage/cost metadata, outcome; no private reasoning |
| `insights` | workspace/customer/id, brain/source versions, review/job, candidate_need, outcome kind, action, explanation, evidence refs, cohort summary, uncertainties, lifecycle, dedupe key; unique workspace/dedupe key |
| `subscriptions` | workspace/id, creator_key_id, scope, timezone, weekly local time, next_run_at, active/verified flags, URL, encrypted signing key/version |
| `subscription_customers` | workspace/subscription/customer; explicit set membership; unique scoped subscription/customer |
| `review_occurrences` | workspace/subscription/id, scheduled_for, deadline, expected/finished customer count, status; unique subscription/scheduled_for |
| `review_customers` | workspace/review/customer, captured source/brain revision, job, terminal state; unique review/customer |
| `webhook_deliveries` | workspace/subscription/insight/id, payload version, frozen body/hash, attempts, next_attempt_at, state; unique subscription/insight/event-type |
| `delivery_attempts` | workspace/delivery/attempt, start/end, destination verification result, status/error, response code; no response body or secret |
| `audit_events` | workspace, actor/key/service, event type, target ID, timestamp, scrubbed metadata |
| `idempotency_records` | workspace/key/route/idempotency key, request hash, response status/body, expiry (at least seven days); stored in the mutation's transaction |
| `admission_windows` | workspace/key/route group, window start, request count; unique scope/window; transactional fixed-window request quota |
| `usage_reservations` | workspace/job/model attempt, estimated token/cost upper bound, reserved/settled/released state; reserve before provider call, settle recorded usage |

Indexes: source lookup by workspace/customer/sequence; latest snapshots by customer/version; due jobs by status/available_at; outbox by dispatched/next_attempt; due subscriptions by active/next_run; reference cases by workspace/cutoff/completeness; insights by workspace/customer/lifecycle/time. JSONB flexible content is not a replacement for indexed ownership/job columns.

## Authorization

API key capabilities: `customers:write`, `sources:write`, `data:read`, `query:run`, `insights:read`, `feedback:write`, `evaluate:run`, `subscriptions:manage`. Customer grants are either workspace-wide or an explicit set; capabilities alone never broaden that set. Workspace-wide grants are required to create new customers. Operator tooling owns workspace/key creation, narrowing/revocation and reference eligibility; clients cannot grant their own reference access.

API repositories require verified workspace and customer scope; no unscoped customer repository methods. Enable/force PostgreSQL RLS on tenant tables with transaction-local `app.workspace_id`; runtime roles are non-owner and lack `BYPASSRLS`. Use parameterized `set_config(..., true)` inside each transaction, so pooled connections cannot retain another tenant's context. Policies apply to reads and writes. Customer-key grants remain application checks beyond workspace RLS; do not claim RLS alone enforces those grants.

Implemented role model: [ADR 0007](decisions/0007-database-roles-and-definer-functions.md). Database roles: migrator owns the database and schema; API reads/writes only its needed tables; worker reads/writes scoped processing tables; dispatcher has limited access to cross-workspace operational due IDs/outbox, never customer bodies. API-key lookup uses a dedicated narrow lookup function/role that returns only identity/scope metadata for an exact hash; it is not an unscoped data reader. Workers receive trusted workspace/job IDs through IAM-authenticated handlers, verify the stored job/scope, then open a scoped transaction.

Subscriptions retain their creator key and scope. Recheck key revocation, capability/customer grants, active customer state, workspace state and destination status before scheduling and every delivery. Revocation cancels pending work/delivery authority even if a model run already started. A narrowed creator scope pauses incompatible subscriptions until edited/reverified.

## Source and Upload Lifecycles

Intake increments a per-customer monotonic sequence under a short row lock. Hash canonical validated input with SHA-256. The same source identity/hash returns the original job; same identity with different content is `409`. HTTP idempotency keys similarly bind route/key/body hash and retain their result in job/operation records for at least seven days.

Upload lifecycle: `pending -> finalized -> extracting -> ready | unsupported | failed`. Server chooses the bucket/key and grants a 15-minute create-only signed PUT URL. Finalization validates actual object metadata and content signature where supported, rejects oversized content, records immutable generation, and creates an attachment source/job exactly once. Extraction references that generation so later object changes cannot alter evidence. Unfinalized uploads expire after 24 hours and are cleaned up by an operational job; bucket lifecycle is a backup, not customer authorization.

Inline sources carry their original JSON/text. File extraction stores text/observations and provenance in `files`; the source event always points to original bytes, not just extracted prose. Input can be retained with `unsupported` status without a misleading successful memory update. Failed extraction can retry against the same immutable evidence.

## Memory Contract

Implemented per [ADR 0008](decisions/0008-situation-personality-experience-memory.md); shared schemas live in `packages/contracts/src/memory.ts`. A `BrainSnapshot` row holds schema version 2 structured memory, the rendered documents (one JSONB map keyed by logical path), the profile signature, the source watermark (highest incorporated source sequence), and model/prompt versions. Paths are logical names, not files; retrieval/export needs no directory scan.

| Path | Category | Assertion kinds | Holds |
|---|---|---|---|
| `overview.md` | Generated | none | Summary, document counts, open goals, items due for review; never a home for facts |
| `situation/current.md` | Situation | `circumstance`, `commitment`, `constraint`, `transition` | What is true now; "Previously true" keeps retired items |
| `situation/goals.md` | Goals and intent | `goal` (`goal_state`, `target_date`) | Customer-expressed or confirmed outcomes, deadlines, progress |
| `personality/preferences.md` | Personality | `preference`, `value`, `decision_habit` | Contextual preferences, values and decision habits |
| `personality/communication.md` | Personality | `communication` | Channel, tone, detail and help style |
| `experience/history.md` | Experience | `life_event`, `decision`, `outcome` | Significant events, previous decisions and their outcomes |
| `experience/interactions.md` | Experience | `interaction`, `feedback` | Service interactions, accepted/rejected help, feedback |
| `evidence/sources.md` | Evidence | none | Ledger of incorporated sources and the assertions each supports |

Each assertion has a server-assigned ID prefixed by category (`s_001`, `g_002`, `p_003`, `x_004`), kind, life area (`home`, `work`, `household`, `finances`, `banking`, `health`, `mobility`, `education`, `leisure`, `other`; used as Markdown headings), statement, status (`observed`, `customer_confirmed`, `inferred`, `corrected`, `retired`), evidence references (event ID plus per-customer sequence, optional span), optional canonical tag, context, validity dates, review date, related assertion IDs, and recorded/updated/retired timestamps. `inferred` marks an interpretation, never a fact. A tag is supported by assertions, not an unexplained model adjective. Missing facts are not negative traits; purchases do not prove sensitive traits, exact item, beneficiary, or household context. Proposed help becomes a goal only when the customer expresses or confirms it.

`MemoryPatch` is the model output: an optional summary and `add`/`update`/`retire` operations citing evidence by source sequence. The model cannot set workspace/customer authority, new assertion IDs, versions, schedules, or payment commands. Code checks that every cited sequence belongs to this customer and that each operation cites at least one source from the new batch; updates/retirements target active assertions, kind never changes, tags come from the category's vocabulary, and goal fields apply only to goals. Invalid output gets one repair round with the listed errors; otherwise the job fails and the last valid snapshot remains current. Default review horizons where the model gave none: circumstances/commitments/constraints 90 days, transitions 30, goals their target date or 30 days, inferred personality 180 days; experience does not expire. Retirement preserves history: the assertion keeps its evidence and moves to the document's retired section.

Each Librarian job loads the latest snapshot and every source above its watermark, bounded to 25 events and 120 KiB of content (the first event is always taken). The commit locks the customer, requires the current brain version to equal the patch's base, then inserts the next immutable version with the new watermark; on a lost race it rolls back and retries against the newer brain. A job whose event is already at or below the watermark completes as `already_incorporated`. File sources are shown to the model as unextracted attachments until extraction exists. Customer creation commits the empty version-1 skeleton in the same transaction; the API role may insert only that skeleton (restrictive RLS policy in migration 0002). Correction history is retained.

## References and Pattern Evidence

Personality/preferences and situation use separate canonical tags. Demo seed vocabulary includes `budget_conscious`, `prefers_self_service`, `likes_planning`, `travel_interested`, `renting`, `moving_soon`, `starting_new_job`. Tags can be extended only through shared-contract changes. Goals/intent remain separate from personality matching.

Reference eligibility is opt-in per customer and same-workspace only. At most one eligible snapshot per distinct reference customer; exclude target and held-out evaluation customers. A snapshot must have been constructed only from sources known at its cutoff: both occurrence time and received/available time are no later than cutoff. A retrospectively generated fixture snapshot is explicitly labeled synthetic/backtest reconstruction, not contemporaneously observed.

At forecast time T, include only completed follow-up windows with recorded observations available by T. Capture `complete_at`/outcome-recorded timestamps so backdated late arrivals cannot leak hindsight. Outcomes are supplied observed events, not LLM guesses. For the demo, horizon is 30 days and outcome is `requested_move_planning_help`.

Matcher uses canonical tag Jaccard per dimension. Empty union gives zero support. Initial score is 0.4 personality + 0.6 situation, minimum 0.5, top ten eligible cases, minimum five distinct customers to display a cohort rate. These versioned engineering defaults are not learned, calibrated, or anonymity guarantees.

`CohortEvidence` exposed to Proactor includes matcher version, as-of time, outcome code/horizon, distinct match/outcome counts, optional eligible-set baseline, aggregate dimensions and limitations. Internal job records retain exact case IDs for audit; no other-customer identity or raw Markdown is included in model input or public output.

## Insight and Review Lifecycles

Proactor input binds target brain and source revisions, explicit goals, prior feedback, and aggregate evidence. Output kind is `cohort_supported`, `hypothesis_only`, `insufficient_cohort_support`, or `no_action`; a need/explanation/action is required only when applicable. No-action jobs persist their reason for inspection but create no webhook delivery.

Insight lifecycle: `pending -> dismissed | superseded | stale`; client confirmation records feedback, not permission for banking execution. Allowed action vocabulary: `ASK_A_QUESTION`, `SHOW_INFORMATION`, `PREPARE_ACTION`, `SCHEDULE_REMINDER`, `HAND_OFF`, `DO_NOTHING`. These describe proposed help only. The application executes none of them as financial actions.

A stale insight can return to pending only after a fresh evaluation validates the same material evidence basis. The dedupe key uses need/action and supporting assertion state, not only a new snapshot number; an already delivered unchanged insight is not sent again. Dismissal remains suppressing until materially changed evidence warrants a new candidate, with that change explained.

On any new input, increment source revision and conservatively mark older pending insights stale immediately. On correction/dismissal, also invalidate queued deliveries and record suppression evidence. Review and send both check current source/brain revisions and absence of pending earlier extraction. If mismatched, reevaluate within the review deadline or expose stale status without sending. Previously delivered content cannot be recalled; current reads show its invalidation. Demo weekly output is newly actionable insights; unchanged need/action across successive reviews is deduplicated until materially changed evidence or feedback.

## Jobs, Leases and Outbox

Job status: `queued`, `running`, `retry_wait`, `succeeded`, `failed`, `cancelled`. Claim atomically if due and not leased; increment a fencing token and set lease expiry beyond the bounded handler deadline. All result commits require that token. Do not hold transaction locks while calling models/webhooks. Customer-memory leases and optimistic revisions prevent stale parallel commits.

Commit domain change and outbox together. Dispatcher claims outbox rows with short `SKIP LOCKED` transactions, creates a deterministic Cloud Tasks transport name per job/generation, then marks dispatched. An ambiguous create response is safe to retry; an expired/lost transport is recreated with a new generation while the operation key remains stable. Clock reconciliation checks due unsent outbox, expired leases and terminal job states. Queue task names alone never provide permanent exactly-once semantics.

Webhook delivery is at least once. Freeze body and delivery ID once eligible, then sign each attempt with a fresh timestamp. A timeout after consumer acceptance can cause a repeated send; receivers deduplicate by delivery ID. Disabling/revoking or stale evidence cancels pending retries; policy checks precede every attempt. Success/attempt records can recover from repeated transport jobs without rerunning a completed domain operation.

## Retention and Deletion

Synthetic demo sources/memory remain until explicit teardown; no real-data retention promise is established. Customer deletion first marks `deleting`, cancels jobs/deliveries and blocks reads, then durable cleanup removes object generations and dependent data before recording completion. GCS and SQL deletion is reconciled, not falsely claimed atomic. Reference participation is removed and affected aggregate insights invalidated. Operational audit retains only non-content IDs/status needed for the demo; a production retention/access/deletion policy requires separate review before real inputs.
