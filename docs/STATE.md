# Current State

Last updated: 2026-10-01 - Google Cloud backend architecture, data/API contracts and implementation gates completed.

## Current Status

Onboarding and architecture design are complete. The selected backend is ready to scaffold. This repository has documentation only; no application, migrations, cloud resources or verified runtime capabilities exist yet.

## Status Table

| Area | Status | Notes |
|---|---|---|
| Agent management workflow | Done | Read order, governance, state, ADRs, hook, PR checklist adapted |
| Product and sources | Done | Brief archived; latest discussion reconciled with provenance |
| Data architecture | Done | PostgreSQL table design, evidence/versioning, tenant scope, jobs/outbox and delivery lifecycle |
| Technical architecture | Done | Google Cloud, Hono/TypeScript, Cloud SQL/GCS, Vertex, Tasks/Scheduler; ADRs 0003-0006 |
| API contract | Done | Intake/upload/read/query, insight/feedback, schedule and signed webhook interfaces defined |
| API, Librarian, Proactor | Planned | No implementation |
| Synthetic fixtures | In progress | `fixtures/synthetic-bank/generate.py`: Emma, Jonas, 22 look-alikes (14 bought a home) with seeded 3-file brains; ~76 other-life-stage customers still to add |
| Demo and presentation | In progress | Use case, video script and product description drafted in [plans](plans/video-and-product-description.md); original guide needed to verify submission rules |

## In Flight

Delivery team: video/product-description drafts in `docs/plans/video-and-product-description.md` and root presentation files. Their proposed story needs alignment with the selected runtime contracts before recording. Human backend implementation owners remain unassigned; architecture's workstream roles describe responsibility areas only.

## Blocked

No blocker for local scaffolding. Cloud deployment needs the actual GCP project/billing/identity configuration and a model availability smoke test. Original hackathon guide/earlier discussion files remain unavailable, so submission rules cannot be independently confirmed.

## Next

1. Platform owner scaffolds the pinned Node/Hono workspace, contracts, PostgreSQL migrations, operator/key CLI and real-DB verification gate.
2. Implement one customer's intake -> durable job -> Librarian -> persisted Markdown -> scoped GET/read-only query; prove isolation/replay/failure behavior.
3. Add files/extraction, synthetic reference cases and deterministic patterns, then scheduled Proactor and verified webhook delivery.
4. Provision a dedicated synthetic GCP environment, run cloud acceptance checks, and complete the moving-assistance demo/presentation.

## How to Update

Keep this a snapshot. Update relevant rows, prune finished in-flight items, describe concrete blockers, and keep Next actionable. Preserve other owners' sections during concurrent edits. Durable decisions belong in ADRs.
