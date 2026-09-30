# Verification Reference

## Current Gate

`pnpm verify` runs Biome, typecheck, Vitest (contracts, storage, backend), build, and OpenAPI freshness. CI also checks that `pnpm db:generate` produces no migration drift, and builds the image. Documentation changes still use the checks in [conventions](conventions.md#5-verification).

Database suites run on a Testcontainers PostgreSQL 17 shaped like Cloud SQL: a non-superuser migrator owns the database, and the API/worker connect as login members of `bob_api`/`bob_worker` ([ADR 0007](decisions/0007-database-roles-and-definer-functions.md)). A missing Docker daemon fails the run. `BOB_ALLOW_DB_SKIP=1` skips database suites for local iteration only. With Colima, export `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock` and `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.

Covered today: forced RLS on every tenant table, no role bypass or owner exemption, no pooled-context leakage, key lookup through the definer only, and worker-only transport functions. Also covered: intake sequencing/dedup/conflict/correction scope; no Proactor from ingestion; idempotency replay/conflict; auth, capability and grant checks on every implemented route; shared admission windows; the worker IAM gate and closed kind allowlist; fencing tokens; retry generations; expired-lease recovery; enqueue-interruption recovery; duplicate delivery; and scrubbed errors. Also covered: the version-1 skeleton on customer creation and the API role's restriction to it; patch validation (foreign/old-only evidence, vocabulary, kind/goal rules, unknown IDs), repair-once then fail, provider-error retry, brain-version race retry, batching and already-incorporated jobs, corrections, retirement history, deterministic and escaped rendering, review-due flags, customer content kept out of system instructions, brain/document/query routes with grants, idempotency and model admission, and query citation filtering without memory mutation. Model behavior is tested with a scripted fake; the OpenRouter adapter with an injected fetch, including the provider-schema reduction. Not covered yet: real model output quality, uploads, Proactor, schedules, delivery, and any cloud behavior.

## Future Behavioral Coverage

Runner is Vitest. Use real PostgreSQL 17/Testcontainers for persistence, migrations and RLS checks. CI must fail rather than silently skip its required database suites. Exercise cloud integration boundaries against a synthetic GCP environment and document local infra-dependent skips.

| Behavior | What must be demonstrated |
|---|---|
| Isolation | Workspace/customer scope enforced for inputs, queries, brains, jobs, feedback, and webhook settings |
| Evidence | Claims grounded; personality and situation separate; uncertainty and missing facts preserved |
| Input replay | Duplicate source events do not duplicate memory updates or insights |
| Corrections | Scoped changes update memory and invalidate dependent pending insights |
| Concurrency/failure | Version checks avoid lost updates; latest valid brain survives failed processing |
| Read-only queries | Answering does not silently mutate memory or perform actions |
| Automatic review | Scheduled evaluation runs without customer action; ingestion alone does not start the default Proactor cycle |
| Schedule semantics | Timezone, missed runs, disabled settings, and repeated schedule ticks behave as specified |
| Delivery | Authorized payload, destination checks, signing, bounded retry, deduplication, revocation and freshness |
| Comparison | No future leakage; distinct eligible customers; empty tags and insufficient reference support handled |
| Injection | Instructions hidden in data cannot expand access or action authority |
| Disclosure | Synthetic labels and metrics are correct; secrets absent from logs and repository |
| File evidence | Metadata spoofing/oversize rejected; pinned generations stable; unsupported formats disclosed; extraction limits enforced |
| Commit/dispatch gap | A crash after SQL commit or ambiguous queue creation recovers through outbox reconciliation |
| Tenant pools | Transaction-local RLS context cannot leak across pooled requests; runtime roles cannot bypass policies |
| Historical time | Both source occurrence and receipt/availability precede cutoff; late-recorded outcomes cannot leak into a forecast |
| Cloud identity | Public API key cannot invoke worker; correct Tasks/Scheduler identity can invoke only intended handlers |

Control time instead of sleeping. Unit-test deterministic logic and verify wiring through real API/storage/worker paths. Preserve meaningful tests when extracting code. Expensive regressions need targeted tests and a reason at the fix site.

## Architecture-to-Implementation Gates

1. Fresh clone installs pinned tooling without private registry access; migrations apply to an empty real database.
2. Scoped key creates a customer, sends JSON/text, survives an enqueue interruption, commits a validated brain and retrieves its Markdown/query answer.
3. Upload finalization proves immutable evidence and supported/unsupported extraction; duplicate/conflicting identity and concurrent updates behave correctly.
4. Two workspaces and restricted keys prove isolation across every route, job, file and subscription.
5. Fixed clock proves Monday 09:00 Brussels, DST/missed occurrences, duplicate ticks, no-action reporting and delivery cancellation after corrections/revocation.
6. Matcher proves no future leakage, known counts and insufficient-support behavior against held-out fixtures.
7. Synthetic GCP smoke proves real SQL/GCS/Tasks/Scheduler identity, OpenRouter secret mounting and timeout behavior, webhook signature/retry/SSRF transport, backup restore, and rollback.

Real model smoke checks parseability, evidence adherence and measured usage/latency; deterministic provider fixtures cover failures without requiring live calls in every unit suite. Gates 1 and 4 are met locally for implemented routes. Gate 2 is met locally, and a manual live run on 2026-10-01 with `google/gemini-3.8-flash` via OpenRouter covered customer creation, five mixed sources (one model call, 7 s), three queries (answerable, injection-bait, unanswerable) and a correction that abandoned a goal and retired a constraint. That run is not an automated suite or a quality evaluation. No cloud acceptance test has run.

## Forecast Evaluation

Use held-out synthetic customers with subsequent observed outcomes and an eligible reference set. Report reference coverage and compare with overall outcome-frequency baseline. Fixture success verifies that synthetic workflow only; it does not establish real-world prediction quality. No forecast result or accuracy has been measured.
