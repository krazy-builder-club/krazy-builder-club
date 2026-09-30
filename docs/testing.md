# Verification Reference

## Current Gate

Only documentation checks apply. Run the gate in [conventions](conventions.md#5-verification), inspect local links/index coverage, check source precedence, and ensure starter placeholders remain only in intentional templates. No application runner, database tests, or live endpoints exist yet.

## Future Behavioral Coverage

Choose the runner during architecture and wire meaningful checks into the actual verification command. Exercise integration boundaries against real disposable infrastructure when available; document infrastructure-dependent skips and run those checks in CI.

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

Control time instead of sleeping. Unit-test deterministic logic and verify wiring through real API/storage/worker paths. Preserve meaningful tests when extracting code. Expensive regressions need targeted tests and a reason at the fix site.

## Forecast Evaluation

Use held-out synthetic customers with subsequent observed outcomes and an eligible reference set. Report reference coverage and compare with overall outcome-frequency baseline. Fixture success verifies that synthetic workflow only; it does not establish real-world prediction quality. No forecast result or accuracy has been measured.
