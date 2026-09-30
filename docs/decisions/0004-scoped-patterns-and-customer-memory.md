# 0004 - Scoped Patterns and Customer Memory

- **Status:** Accepted
- **Date:** 2026-10-01

## Decision

Store each customer's versioned structured memory and deterministically rendered Markdown in one scoped PostgreSQL database. Keep original sources separate. Librarian processes one customer's evidence. Proactor receives that customer's memory and aggregate evidence from a deterministic historical pattern service, never arbitrary access to all databases or raw brains.

Reference matching is restricted to explicitly eligible customers within one workspace. No cross-workspace matching in the MVP. Adopt transparent tag overlap and a synthetic moving-assistance scenario as initial configurable defaults, with exact settings in the architecture/data references.

## Rationale

The user wants pattern analysis but has not settled how another agent should read other customers. Scoped code can select comparable historical cases reproducibly and enforce access before model inference. A single database supports isolation without operationally managing 100 databases. Markdown is a readable representation, not the only query index.

## Consequences

Maintain coherent brain/signature versions, evidence links, and source watermarks. Pattern service output is aggregate and provenance-backed. Explicit intent overrides cohorts; empty/missing evidence does not imply confident prediction. Future cross-workspace or generative pattern discovery requires a new decision and permission design.
