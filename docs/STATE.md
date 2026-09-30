# Current State

Last updated: 2026-10-01 - Platform scaffold implemented, verified locally and merged to `main`.

## Current Status

Architecture is complete and the platform scaffold is implemented. The pnpm workspace has shared contracts, a Drizzle schema for every data table, a forced-RLS security migration ([ADR 0007](decisions/0007-database-roles-and-definer-functions.md)), the Hono API (health, customers, event intake/reads, jobs, OpenAPI), the IAM-gated worker runtime (lease-fenced runner, outbox dispatcher, reconciliation, local driver), an operator CLI, a Dockerfile and CI. `pnpm verify` passes locally: 49 tests run against real PostgreSQL 17. Built artifacts were smoke-tested end to end against a local database. No Librarian/model code, uploads, Proactor, delivery, Cloud Tasks transport or cloud resources exist.

## Status Table

| Area | Status | Notes |
|---|---|---|
| Agent management workflow | Done | Read order, governance, state, ADRs, hook, PR checklist adapted |
| Product and sources | Done | Brief archived; latest discussion reconciled with provenance |
| Data architecture | Done | PostgreSQL table design, evidence/versioning, tenant scope, jobs/outbox and delivery lifecycle |
| Technical architecture | Done | Google Cloud, Hono/TypeScript, Cloud SQL/GCS, Vertex, Tasks/Scheduler; ADRs 0003-0006 |
| API contract | Done | Intake/upload/read/query, insight/feedback, schedule and signed webhook interfaces defined |
| Platform scaffold | Done (local) | Contracts, storage/migrations/RLS, API intake/reads/jobs, worker runtime, operator CLI, CI, image; gates 1 and 4 met for implemented routes |
| Librarian | Planned | Next: `librarian` job handler (Vertex patch, validation, render, snapshot commit), then brain/query routes |
| Uploads/extraction, Proactor, delivery | Planned | Tables exist; no handlers or routes |
| Synthetic fixtures | Planned | Approximately 100 customers discussed; none generated |
| Demo and presentation | In progress | Use case, video script and product description drafted in [plans](plans/video-and-product-description.md); original guide needed to verify submission rules |

## In Flight

Delivery team: video/product-description drafts in `docs/plans/video-and-product-description.md` and root presentation files. Their proposed story needs alignment with the selected runtime contracts before recording. Human owners for Librarian, analysis and delivery remain unassigned; architecture's workstream roles describe responsibility areas only.

## Blocked

No blocker for local scaffolding. Deployment is blocked: no GCP project/billing/region, Terraform, deploy workflow or Cloud Tasks transport exists yet, and a model availability smoke test is needed. Original hackathon guide/earlier discussion files remain unavailable, so submission rules cannot be independently confirmed.

## Next

1. Resolve the GitHub account billing lock, then re-run CI on `main` (verify + image; it does not deploy). The first run on 2026-10-01 never started because of that lock; `pnpm verify` passed locally.
2. Librarian owner: register the `librarian` handler (Vertex adapter, `MemoryPatch` validation, deterministic Markdown render, revision-checked snapshot commit via `ctx.commit`), then `GET brain`/documents and the read-only query job.
3. Add files/extraction, synthetic reference cases and deterministic patterns, then scheduled Proactor and verified webhook delivery.
4. Provision a dedicated synthetic GCP environment, run cloud acceptance checks, and complete the moving-assistance demo/presentation.

## How to Update

Keep this a snapshot. Update relevant rows, prune finished in-flight items, describe concrete blockers, and keep Next actionable. Preserve other owners' sections during concurrent edits. Durable decisions belong in ADRs.
