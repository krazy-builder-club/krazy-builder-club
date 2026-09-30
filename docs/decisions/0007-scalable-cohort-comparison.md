# 0007 - Scalable Cohort Comparison

- **Status:** Proposed
- **Date:** 2026-10-01

## Decision

Once the MVP pattern service from [ADR 0004](0004-scoped-patterns-and-customer-memory.md) works, scale cross-customer comparison with a funnel that never compares customer pairs with a model:

1. **Profile on write.** When Librarian commits a brain version, it also stores that version's structured features (for example income band, housing status, household signals, life stage) and an embedding of the situation text. Cost scales with changed customers, not with pairs.
2. **Review only dirty customers.** The scheduled Proactor skips a customer unless their profile signature changed, a relevant reference outcome landed, or a slow fallback interval (for example monthly) expired. Cheap deterministic rules (new salary, rent change, new recurring charge) can also mark a customer worth reviewing.
3. **Block, then search.** Narrow candidates with SQL filters on coarse features, then run approximate nearest-neighbour search (pgvector HNSW in the existing PostgreSQL) for a small candidate set, then apply the existing transparent rerank and thresholds.
4. **Compare to cohorts, not people.** A weekly batch job clusters eligible reference profiles into life-stage cohorts and aggregates observed transitions (for example share of a cohort that took a mortgage within the horizon). The per-customer review becomes a cohort lookup plus one model call with the target brain and aggregate evidence.

Never use nationality, ethnicity, or other protected attributes as matching or blocking features. Age is allowed only as a coarse life-stage band. Prefer behavioural life-stage signals from supplied data.

The MVP keeps brute-force scoring from the [architecture](../architecture.md) at demo scale (about 100 customers). Adopting this funnel is a follow-up decision once the build settles.

## Rationale

Pairwise comparison is quadratic. At 100 customers that is about 5,000 pairs; at KBC's roughly 2.3 million customers it is about 2.6 trillion, which no model or cache can serve. Caching pairwise similarity keeps quadratic storage and a quadratic first pass. Per-customer profiles plus indexed search make one weekly review close to linear in changed customers. Cohort aggregates reuse ADR 0004's rule that Proactor sees aggregate evidence rather than other customers' brains, which also supports the privacy story.

pgvector keeps the index inside the selected database, with no new service. Protected-attribute features create discrimination and regulatory risk for financial suggestions and would not survive a bank jury.

## Consequences

The storage owner adds profile feature and embedding columns (or a table) linked to brain versions, and later the pgvector extension and an HNSW index. The embedding model is a configuration choice alongside the existing Vertex models. Dirty tracking needs a signature hash per brain version and an event when reference outcomes arrive. Cohort batch output is versioned like other reference settings, and customers stay reviewable through the monthly fallback so stale profiles do not go silent forever.

Thresholds, cohort count, fallback interval, and candidate sizes are unvalidated starting points. Nothing here is implemented; accepting this record requires the pattern service owner's agreement after the MVP matcher exists.
