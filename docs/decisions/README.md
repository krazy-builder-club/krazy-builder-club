# Decision Log

Accepted records are append-only. Use the next free number and [template](TEMPLATE.md). New decisions supersede old ones by reference; later-merged collisions are renumbered. Use Proposed status for unresolved choices, and do not describe them as accepted.

| Record | Status | Decision |
|---|---|---|
| [0001](0001-docs-and-agent-workflow.md) | Accepted | Adopt agent-os and sanction the initial closed documentation map |
| [0002](0002-onboarding-scope-and-proactive-boundary.md) | Accepted | Documentation first; latest automatic Proactor direction overrides source trigger defaults |

| [0003](0003-google-cloud-backend-stack.md) | Accepted | Google Cloud, Hono/TypeScript, PostgreSQL, API-only MVP |
| [0004](0004-scoped-patterns-and-customer-memory.md) | Accepted | Database-backed brains and workspace-scoped deterministic pattern service |
| [0005](0005-durable-scheduled-work.md) | Accepted | Jobs/outbox, Tasks, database schedules, verified insight webhooks |
| [0006](0006-api-contract-reference.md) | Accepted | Sanction the API contract reference and schema ownership |
| [0007](0007-scalable-cohort-comparison.md) | Proposed | Post-MVP comparison funnel: profile on write, dirty-only reviews, blocking + ANN, cohort aggregates; no protected attributes |
