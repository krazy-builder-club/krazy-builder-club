# Documentation Index

Start at [AGENTS.md](../AGENTS.md). Read conventions, state, relevant ADRs, then task references.

## Closed Information Map

| Home | Bucket | Purpose and update owner |
|---|---|---|
| [conventions.md](conventions.md) | Conventions | Operating rules; changed when workflow changes |
| [STATE.md](STATE.md) | State | Single current snapshot; every task owner at handoff |
| [product.md](product.md) | Reference | Requirements and product questions; knowledge steward |
| [architecture.md](architecture.md) | Reference | Selected backend/cloud components and flows; architecture owner |
| [api.md](api.md) | Reference | HTTP, jobs, uploads and webhook design; platform contract owner |
| [data.md](data.md) | Reference | Physical table design, evidence/versioning and access; storage owner |
| [testing.md](testing.md) | Reference | Verification and behavioral acceptance; verification owner |
| [delivery.md](delivery.md) | Reference | Demo and submission expectations; demo owner |
| [decisions/](decisions/README.md) | Decisions | Durable choices and rationale; decision owner |
| [plans/](plans/README.md) | Ephemeral state | Temporary working plans; active owner, deleted when complete |
| [sources/](sources/README.md) | Reference evidence | Provenance and immutable supplied material; knowledge steward |

Root README is orientation, AGENTS routes agents into the pipeline, and CLAUDE imports it. These link to canonical information rather than maintaining competing specifications.

## Governance

- One home per fact: conventions, current state, ADRs, or descriptive reference. Orientation summaries link to their canonical homes.
- New top-level `docs/*.md` requires a justifying ADR and index row. [ADR 0001](decisions/0001-docs-and-agent-workflow.md) sanctions this initial set.
- Sources are archived evidence, not current instructions. Add a register entry for every new source.
- Accepted ADRs are append-only. Supersede with a new ADR, and index every numbered record.
- Plans live in `docs/plans/`; fold outcomes into their homes and delete completed plans.
- Label proposals distinctly. Adopting documentation conventions does not accept the brief's technical defaults.
