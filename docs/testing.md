# Verification Reference

## Current Gate

Documentation checks and cloud-foundation static validation apply. Run the gate in [conventions](conventions.md#5-verification), inspect local links/index coverage, check source precedence, and ensure starter placeholders remain only in intentional templates. No application runner, database tests, or live endpoints exist yet.

## Future Behavioral Coverage

Selected runner is Vitest. Scaffold `pnpm verify` to run Biome, typecheck, tests, build and OpenAPI freshness; it is a target interface, not an executable command yet. Use real PostgreSQL 17/Testcontainers for persistence, migrations and RLS checks. CI must fail rather than silently skip its required database suites. Exercise cloud integration boundaries against a synthetic GCP environment and document local infra-dependent skips.

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
7. Synthetic GCP smoke proves real SQL/GCS/Tasks/Scheduler identity and OpenRouter secret mounting and timeout behavior, webhook signature/retry/SSRF transport, backup restore, and rollback.

Real model smoke checks parseability, evidence adherence and measured usage/latency; deterministic provider fixtures cover failures without requiring live calls in every unit suite. No real model, database or cloud acceptance test has run in the architecture task.

## Forecast Evaluation

Use held-out synthetic customers with subsequent observed outcomes and an eligible reference set. Report reference coverage and compare with overall outcome-frequency baseline. Fixture success verifies that synthetic workflow only; it does not establish real-world prediction quality. No forecast result or accuracy has been measured.

## Deployment Preparation Verification

Run `python3 scripts/check-doc-links.py`, `git diff --check`,
`terraform fmt -check -recursive infra/terraform`, and
`terraform -chdir=infra/terraform validate` after initialization. The GitHub
prerequisite workflow runs these static checks without cloud credentials.
Markdown verification checks file targets; it excludes anchors and the verbatim
source archive. Review the closed index and decision coverage separately.

The manual Cloud authentication check requires applied federation and GitHub
environment variables. It proves only short-lived login and Cloud Run list
access, not application behavior, secret mounting, migrations, or delivery.
Those acceptance gates require the architecture handoff and executable scaffold.
