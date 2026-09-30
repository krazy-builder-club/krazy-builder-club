# 0009 - OpenRouter Model Provider

- **Status:** Accepted
- **Date:** 2026-10-01

## Decision

Run Librarian and query inference through OpenRouter's OpenAI-compatible chat completions API, with a JSON-schema `response_format` and `provider.require_parameters`. This supersedes Vertex AI/Google Gen AI SDK inference in [ADR 0003](0003-google-cloud-backend-stack.md) and the `vertex`/`gemini_api` provider options in [ADR 0008](0008-situation-personality-experience-memory.md). The rest of the Google Cloud stack is unchanged.

`MODEL_PROVIDER` is `openrouter` or `none`. When unset, a present `OPENROUTER_API_KEY` selects OpenRouter. The worker receives the key from Secret Manager secret `openrouter-api-key`, provisioned by the deployment workstream; it never belongs in Git or in GitHub Actions secrets. The default model for both roles is `google/gemini-3.8-flash`, and each role is configurable separately (`LIBRARIAN_MODEL`, `QUERY_MODEL`).

## Rationale

The user supplied an OpenRouter key and asked for it because it makes models easier to manage, and it is the only funded model access available. The deployment workstream had already provisioned the key under this name. Model IDs become configuration rather than a provider integration.

A live test on 2026-10-01 settled three details:

- **Schema keywords.** Google via OpenRouter rejects `minItems`/`maxItems` in the patch schema (400 `INVALID_ARGUMENT`). The provider hint therefore drops array and numeric bounds and flattens nullable unions. The Zod schema still enforces every bound on the parsed output.
- **Reasoning budget.** Reasoning tokens count against `max_tokens`, so requests set low reasoning effort.
- **Result.** With these settings, a note/transaction batch, three queries (including unanswerable and injection-bait questions) and a correction all behaved as specified.

## Consequences

The `@google/genai` dependency and the Gemini adapter are removed. Provider error bodies are never copied into job errors. OpenRouter routing adds a third-party processor to the data path, which is acceptable for synthetic data only; real data would need a reviewed provider/retention policy. If Vertex access is funded later, adding it requires a new adapter behind the same `ModelClient` port and a new decision.
