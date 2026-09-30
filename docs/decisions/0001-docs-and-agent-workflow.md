# 0001 - Docs Pipeline and Agent Workflow

- **Status:** Accepted
- **Date:** 2026-10-01

## Decision

Adopt the user's requested `zsetup/agent-os` structure by copying and adapting its local starter. Use four buckets: conventions, append-only decisions, one living STATE, and indexed references; temporary plans are deleted when complete. Root AGENTS routes every agent through the read/handoff loop and CLAUDE imports it.

Sanction this initial reference set: product, architecture, data, testing, delivery, and the sources register/archive, alongside conventions, STATE, decisions, and plans. The closed list is in `docs/README.md`.

## Rationale

The user requested an initial management and information layer based on agent-os. Separate canonical homes prevent competing specifications, stale handoffs, and untraceable decisions. Product/data/delivery references are needed to organize the supplied information without selecting technical architecture.

## Consequences

Each task reads the indexed context and updates STATE. New top-level docs require an ADR and index entry. Preserve supplied source material as evidence, distinct from operative instructions. Stack-specific starter assumptions are removed; doc verification and bootstrap conventions are adapted for an empty repository. No shared-library dependency is selected.
