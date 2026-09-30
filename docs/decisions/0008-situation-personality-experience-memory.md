# 0008 - Situation / Personality / Experience Memory and Librarian Contract

- **Status:** Accepted
- **Date:** 2026-10-01

## Decision

Organize each customer brain around what describes the person, not around events, interests or locations. The categories are **Situation** (what is true now, with **Goals and intent** as an explicit home), **Personality** (how they choose, act and prefer to be helped) and **Experience** (what happened and what they learned). A generated **Overview** summarizes the other documents but holds no facts of its own, and an **Evidence** ledger lists the incorporated sources. This supersedes the five flat documents (`overview/personality/situation/goals/interactions.md`) in the data reference. Structured assertions stay canonical, and the Markdown is rendered deterministically into this logical tree:

```text
overview.md
situation/current.md       situation/goals.md
personality/preferences.md personality/communication.md
experience/history.md      experience/interactions.md
evidence/sources.md
```

An assertion's closed `kind` fixes its category, document and ID prefix (`s_`/`g_`/`p_`/`x_`). Life area is a secondary heading dimension, and evidence links sources to assertions. The model returns a flat patch (`add`/`update`/`retire`, with evidence cited by per-customer source sequence). Code validates it, applies deterministic review defaults, renders, and commits only if the brain version is unchanged. One repair round is allowed.

Customer creation commits the empty version-1 skeleton in the same transaction. The API role may insert only that skeleton, which a RESTRICTIVE RLS policy enforces (migration 0002). Every model-derived snapshot remains worker-only. Grounded questions run as read-only `query` jobs over the captured brain's rendered documents.

`MODEL_PROVIDER=vertex` remains the deployed path. `gemini_api` uses the same Google Gen AI SDK with an API key, for local synthetic data only, and is rejected in production. With `none`, Librarian/query jobs stay queued.

## Rationale

The user proposed this structure (source U6) because it describes the person better than a diary of events or a list of interests. Goals need an explicit home because personality influences the future but does not determine it. The Librarian rules come from that proposal. Statements and interpretations are separated (`inferred` status). Categories age differently (default review horizons per kind). Change is preserved by retiring assertions rather than deleting them, and preferences stay contextual. Proposed help does not become customer intent until the customer expresses or confirms it.

Rendering in code, not the model, keeps documents reproducible, escapes supplied text, and lets validation reject invented evidence before anything is committed. Sequence numbers are more reliable than UUIDs in model output. An always-present skeleton meets the request that account creation set up the folder structure, without granting the API role any model-derived writes. The alternatives were a deferred skeleton job, which leaves an empty window of `brain_not_ready`, and a virtual version 0, which gives nothing a durable form. One database with logical paths continues ADR 0004; no per-customer cluster or physical folders are created.

## Consequences

The canonical document set and assertion vocabulary are shared contracts in `packages/contracts/src/memory.ts`. Adding a document, kind or tag is a contract change. `ProfileSignature` tags come only from active personality/situation assertions. The Proactor reads goals and experience from this structure. Snapshots with an older schema version are rejected rather than silently migrated; none exist outside tests.

Document reads use `?path=` because paths contain `/`. Deletion, uploads/extraction, usage reservations and the Proactor remain separate work. The concrete Gemini model ID and structured-output schema acceptance require a live smoke test. Folders can deepen later, when the volume of memory justifies it. Until then, Markdown headings per life area carry the finer structure.
