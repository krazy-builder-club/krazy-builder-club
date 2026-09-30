# Current State

Last updated: 2026-10-01 - Librarian on `main`, switched to OpenRouter and live-tested locally with `google/gemini-3.8-flash`.

## Current Status

Architecture is complete and the platform scaffold is implemented. The pnpm workspace has shared contracts, a Drizzle schema for every data table, a forced-RLS security migration ([ADR 0007](decisions/0007-database-roles-and-definer-functions.md)), the Hono API (health, customers, event intake/reads, jobs, OpenAPI), the IAM-gated worker runtime (lease-fenced runner, outbox dispatcher, reconciliation, local driver), an operator CLI, a Dockerfile and CI. `pnpm verify` passes locally: 97 tests, with the database suites on real PostgreSQL 17. Built artifacts were smoke-tested end to end against a local database.

The Librarian is implemented ([ADR 0008](decisions/0008-situation-personality-experience-memory.md)). Customer creation commits an empty Situation/Personality/Experience brain tree. Intake queues a Librarian job that validates a model patch, renders the Markdown and commits a fenced snapshot. Brain and document reads, the plain-English `query` job, `GET /v1/me` and `external_id` lookup are served. Inference uses OpenRouter ([ADR 0009](decisions/0009-openrouter-model-provider.md)). A local live run with the supplied key passed: creation, mixed sources, grounded and unanswerable queries, injection bait, and a correction. Uploads, the Proactor, delivery, customer deletion, usage reservations, the Cloud Tasks transport and all cloud resources do not exist yet.

## Status Table

| Area | Status | Notes |
|---|---|---|
| Agent management workflow | Done | Read order, governance, state, ADRs, hook, PR checklist adapted |
| Product and sources | Done | Brief archived; latest discussion reconciled with provenance |
| Data architecture | Done | PostgreSQL table design, evidence/versioning, tenant scope, jobs/outbox and delivery lifecycle |
| Technical architecture | Done | Google Cloud, Hono/TypeScript, Cloud SQL/GCS, OpenRouter, Tasks/Scheduler; ADRs 0003-0009 |
| API contract | Done | Intake/upload/read/query, insight/feedback, schedule and signed webhook interfaces defined; brain document reads use `?path=` |
| Platform scaffold | Done (local) | Contracts, storage/migrations/RLS, API intake/reads/jobs, worker runtime, operator CLI, CI, image; gates 1 and 4 met for implemented routes |
| Librarian | Done (local, live-tested) | Memory tree, patch validation/repair, render, fenced commits, skeleton on creation, brain/document/query routes; OpenRouter live run passed; not yet deployed |
| Uploads/extraction, Proactor, delivery | Planned | Tables exist; no handlers or routes |
| Synthetic fixtures | Planned | Approximately 100 customers discussed; none generated |
| Demo and presentation | In progress | Use case, video script and product description drafted in [plans](plans/video-and-product-description.md); original guide needed to verify submission rules |

## In Flight

Delivery team: video/product-description drafts in `docs/plans/video-and-product-description.md` and root presentation files. Their proposed story needs alignment with the selected runtime contracts before recording. Other worktrees exist: `chore/cloud-deployment` (with a local Cloud SQL proxy on 127.0.0.1:55432) and `claude/librarian-frontend-demo-*` (nested under `.claude/worktrees/`, now git-ignored). A frontend demo should consume the brain/query routes above. Human owners for Librarian follow-up, analysis and delivery remain unassigned.

## Blocked

No blocker for local scaffolding. Deployment is blocked: no GCP project/billing/region, Terraform, deploy workflow or Cloud Tasks transport exists yet, and a model availability smoke test is needed. Original hackathon guide/earlier discussion files remain unavailable, so submission rules cannot be independently confirmed.

## Next

1. Resolve the GitHub account billing lock, then re-run CI on `main` (verify + image; it does not deploy). The first run on 2026-10-01 never started because of that lock; `pnpm verify` passed locally.
2. Deployment owner: deploy the Librarian with the worker's `openrouter-api-key` mount (no `MODEL_PROVIDER` needed), then repeat the live scenario against the cloud URL. Their unmerged branch numbers its ADRs 0008/0009; they collide with `main` and must be renumbered on merge. Build a small synthetic evaluation set to tune `prompts.ts` and measure repair rate/latency.
3. Librarian follow-ups:
   - `DELETE /customers/{id}` with a `customer_deletion` job.
   - Usage reservations before model calls.
   - A `GET /customers/{id}/brain/versions` history/diff read.
   - Batch intake for many events in one request.
   - An operator `customer:import` for the roughly 100 synthetic fixtures.
   - Optionally, an operator HTTP admin surface for workspace/key provisioning (it would need an ADR, because ADR 0003 keeps provisioning in the CLI).
4. Add files/extraction, synthetic reference cases and deterministic patterns, then scheduled Proactor and verified webhook delivery.
5. Provision a dedicated synthetic GCP environment, run cloud acceptance checks, and complete the moving-assistance demo/presentation.

## How to Update

Keep this a snapshot. Update relevant rows, prune finished in-flight items, describe concrete blockers, and keep Next actionable. Preserve other owners' sections during concurrent edits. Durable decisions belong in ADRs.
