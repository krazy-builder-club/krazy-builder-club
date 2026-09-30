# Information and Data Reference

This document describes logical information requirements. It does not select a database, physical schema, migration, storage format on disk, or executable contract.

## Information Layers

| Layer | Contents | Intended responsibility |
|---|---|---|
| Raw sources | Original transactions, metadata, notes, corrections; source IDs and timestamps | Ingestion/storage preserves supplied evidence |
| Customer brain | Versioned Markdown plus consistent structured personality, situation, goals, interactions, evidence | Librarian proposes updates; application validates and commits |
| Comparison reference | Historical signatures, cutoffs, observed follow-up outcomes, completeness | Matching/evaluation component; authorized scope only |
| Insights | Candidate need, basis, uncertainties, proposed next step, lifecycle | Proactor proposes; application validates and persists |
| Operations | Ownership, keys, settings, schedules, jobs, webhook delivery attempts | Application code enforces access and lifecycle |

Git stores docs, future code, contracts, and explicitly synthetic fixtures. It is not the live customer database. Physical ownership is assigned during architecture.

## Customer Brain

Personality is a compact description of preferences and observed tendencies, not a psychological diagnosis. Situation is current circumstance, such as renting or a confirmed upcoming move. Goals and intent describe what the person wants. Missing context must not become a negative trait.

Logical view proposed in the brief:

```text
customers/customer_001/
  overview.md
  personality.md
  situation.md
  goals.md
  interactions.md
```

This is a representation example, not a directory created here. Actual Markdown may live in selected persistent storage. Structured tags and rendered documents must come from the same validated version.

Each material assertion carries a source reference, evidence status, timestamp, scope, and review/expiry information when relevant. Distinguish customer-confirmed facts, observations, hypotheses, corrections, and outdated assertions. A correction about one event must not silently become a permanent generalization.

Merchant payments do not establish exact items, purpose, beneficiary, or household context. Do not infer sensitive personal traits from purchases for the demo.

## Logical Contract Candidates

| Candidate | Required meaning, not finalized fields |
|---|---|
| `SourceEvent` | Scoped customer, source identity, event type, occurrence/receipt time, original payload, deduplication identity |
| `BrainSnapshot` | Customer scope, version, processing watermark, Markdown, structured context, supporting evidence |
| `ProfileSignature` | Separate canonical personality and situation tags, supporting evidence and status |
| `ReferenceCase` | Snapshot cutoff, follow-up window, observed outcome codes, window completeness |
| `CohortEvidence` | Authorized aggregate matches, distinct customer count, outcome count, optional eligible-set baseline |
| `Suggestion` | Customer, brain version, candidate need, horizon, evidence basis, uncertainties, synthetic label, proposed action, lifecycle |
| Webhook delivery | Subscription scope, schedule occurrence, output reference, delivery identity and attempt state |

Field names, versioning, payload envelopes, and serialization are pending decisions. The original table names and JSON in the [archived brief](sources/original-project-brief.md) are proposals.

## Required Properties

- Preserve raw evidence and trace derived claims back to it; keep corrections auditable.
- Scope every read/write to authorized ownership and customer access. Check jobs, feedback, exports, comparisons, and delivery settings too.
- Deduplicate replayed inputs. Serialize or version-check updates to one customer's memory; keep the last valid brain after failures.
- Recheck freshness before exposing or delivering suggestions. A correction supersedes dependent outputs even if the next scheduled review has not run.
- Instructions embedded in raw inputs cannot alter access policy, prompts, or permitted actions.
- Use deterministic code for financial arithmetic and an agreed money convention; integer minor units are a candidate from the brief.

## Historical Comparison

Build each historical signature from information available at its cutoff. Include only observed later outcomes, and exclude the target customer from reference matches. For a simulated forecast, reference follow-up windows must already be complete. Separate evaluation customers from reference customers.

The brief's Jaccard overlap, 0.4/0.6 weights, ten-match cap, 0.5 threshold, five-customer minimum, and 30-day horizon remain unvalidated proposals. Two empty tag sets must not count as a perfect match. Avoid future-outcome leakage and do not expose another customer's private profile to the target's Proactor.

## Synthetic Fixtures

Later fixture work should use reproducible source events, historical cutoffs, complete follow-up outcomes, and held-out evaluation cases. Clearly mark all displayed customers and metrics synthetic. Include corrections, duplicate input, differing preferences, incomplete evidence, and a no-action case. No fixture generation or real-data ingestion is part of onboarding.
