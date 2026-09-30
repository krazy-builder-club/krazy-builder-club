# Current State

Last updated: 2026-10-01 - cloud deployment prerequisites prepared; billing project quota blocks provisioning.

## Current Status

Onboarding documentation is complete. Architecture is in progress in a separate workstream. This repository has no application scaffold or verified runtime capabilities.

## Status Table

| Area | Status | Notes |
|---|---|---|
| Agent management workflow | Done | Read order, governance, state, ADRs, hook, PR checklist adapted |
| Product and sources | Done | Brief archived; latest discussion reconciled with provenance |
| Logical data reference | Done | Information and evidence concepts recorded; no physical schema selected |
| Technical architecture | In progress elsewhere | Architecture owner is working on `docs/backend-architecture`; deployment awaits handoff |
| Cloud deployment foundation | Prepared, billing blocked | Dedicated Google project exists; Terraform and verification workflows prepared |
| API, Librarian, Proactor | Planned | No implementation |
| Synthetic fixtures | Planned | Approximately 100 customers discussed; none generated |
| Demo and presentation | Planned | Narrative captured; original guide needed to verify submission rules |

## In Flight

Deployment coordination, infrastructure contracts and verification owner: this
Codex deployment task on `chore/cloud-deployment`. Architecture and application
contracts remain owned by the separate architecture task. Runtime implementation
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

## Blocked

Cloud provisioning is blocked by Google billing project quota. Request an increase, supply another eligible billing account, or identify an existing project dedicated to BOB. Secret Manager activation also requires billing. No blocker for architecture preparation. The original hackathon guide and earlier discussions referenced in the supplied README are unavailable; submission rules cannot be independently confirmed yet.

## Next

1. Resolve billing project quota, then apply the reviewed foundation, upload the OpenRouter key and verify GitHub OIDC.
2. Receive architecture handoff, reconcile OpenRouter provider selection and agree image/entrypoint/migration/health contracts before application CI/CD.
3. Scaffold and prove one customer's ingestion, memory, and read-only query flow.
4. Add scheduled Proactor delivery, feedback, reference cases, then demo and presentation.

## How to Update

Keep this a snapshot. Update relevant rows, prune finished in-flight items, describe concrete blockers, and keep Next actionable. Preserve other owners' sections during concurrent edits. Durable decisions belong in ADRs.
