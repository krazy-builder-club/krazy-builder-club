# Current State

Last updated: 2026-10-01 - architecture landed; deployment foundation reconciled; cloud billing remains blocked.

## Current Status

Onboarding and architecture design are complete. The selected backend is ready to scaffold. The deployment foundation and static workflows are prepared; only the dedicated Google project and core IAM APIs exist. No application, migrations, paid cloud resources or verified runtime capabilities exist yet.

## Status Table

| Area | Status | Notes |
|---|---|---|
| Agent management workflow | Done | Read order, governance, state, ADRs, hook, PR checklist adapted |
| Product and sources | Done | Brief archived; latest discussion reconciled with provenance |
| Data architecture | Done | PostgreSQL table design, evidence/versioning, tenant scope, jobs/outbox and delivery lifecycle |
| Technical architecture | Done | Google Cloud, Hono/TypeScript, Cloud SQL/GCS, Tasks/Scheduler; OpenRouter supersedes Vertex model default in ADR 0007 |
| Cloud deployment foundation | Prepared, billing blocked | Dedicated project exists; Terraform and prerequisite workflows prepared in PR #1 |
| GitHub Actions verification | Account blocked | Workflow runs triggered but no jobs started: GitHub account locked due to billing issue |
| API contract | Done | Intake/upload/read/query, insight/feedback, schedule and signed webhook interfaces defined |
| API, Librarian, Proactor | Planned | No implementation |
| Synthetic fixtures | Planned | Approximately 100 customers discussed; none generated |
| Demo and presentation | In progress | Use case, video script and product description drafted in [plans](plans/video-and-product-description.md); original guide needed to verify submission rules |

## In Flight

Deployment coordination, infrastructure contracts and verification owner: this
Codex deployment task on `chore/cloud-deployment`. Application contracts follow the completed architecture; runtime entrypoints
and migration commands still await the scaffold owner. Runtime implementation
owners are unassigned.

Cloud check: `gcloud` authenticated and project `krazy-builder-club-dev`
(number `958790354689`) created. Billing account project quota prevented linking
billing. No foundation apply, Secret Manager upload, database, deployed service,
or end-to-end OIDC run has succeeded. OpenRouter key authenticated via its
read-only metadata endpoint; no inference was invoked and no key bytes were
printed. The key has no configured limit or expiry. DreamCloud is not a dependency.
Terraform foundation targets OpenRouter; free Vertex entitlement is unverified.
The student Qwiklabs account supplied by the user is not authenticated in this
CLI. Its project ID, available APIs and expiry are pending; the billing failure
above concerns the personal account, not that student account. Do not treat the
lab as a durable host without checking its actual allocation.


Delivery team: video/product-description drafts in `docs/plans/video-and-product-description.md` and root presentation files. Their proposed story needs alignment with the selected runtime contracts before recording. Human backend implementation owners remain unassigned; architecture's workstream roles describe responsibility areas only.

## Blocked

GitHub-hosted Actions is blocked separately: runs `36764448155` and
`36764442745` failed before any steps ran. Check annotations state:
"The job was not started because your account is locked due to a billing issue."
The GitHub account owner must resolve that lock before hosted verification.
Local Terraform validation, workflow lint, documentation links and whitespace
checks passed; they do not prove a hosted run or cloud deployment.

No blocker for local scaffolding. Cloud provisioning and secret upload are blocked by billing project quota on the personal billing account. The student lab project ID, allowed resources and expiry are pending. Supply those details or an eligible billing account/project; then apply the foundation and run identity/model smoke checks. Original hackathon guide/earlier discussion files remain unavailable, so submission rules cannot be independently confirmed.

## Next

1. Platform owner scaffolds the pinned Node/Hono workspace, contracts, PostgreSQL migrations, operator/key CLI and real-DB verification gate.
2. Implement one customer's intake -> durable job -> Librarian -> persisted Markdown -> scoped GET/read-only query; prove isolation/replay/failure behavior.
3. Add files/extraction, synthetic reference cases and deterministic patterns, then scheduled Proactor and verified webhook delivery.
4. Resolve the cloud target/billing blocker, apply the foundation, upload the OpenRouter key and verify OIDC. After the user architecture handoff and executable scaffold, activate application CI/CD and run cloud acceptance checks.

## How to Update

Keep this a snapshot. Update relevant rows, prune finished in-flight items, describe concrete blockers, and keep Next actionable. Preserve other owners' sections during concurrent edits. Durable decisions belong in ADRs.
