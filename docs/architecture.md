# Architecture Brief

Technical design is deferred to the next task. This document records its inputs and decision agenda, not a selected implementation. Product requirements live in [product](product.md), logical information in [data](data.md), and current phase in [STATE](STATE.md).

## Conceptual Boundaries

```text
Supplied input -> authenticated ingestion -> raw evidence
                                         -> Librarian -> versioned customer brain

Read-only question -> authorized customer brain -> grounded answer

Automatic schedule -> Proactor <- customer brain + authorized comparison evidence
                              -> validated insight/no action -> configured delivery

Feedback/correction -> raw evidence -> Librarian -> corrected memory
                                                 -> invalidate affected insights
```

These are responsibilities, not a commitment to separate services. Proactor's automatic clock is independent of ingestion. Application code owns authorization, storage, scheduling, routing, validation, and delivery; no master LLM is required.

## Decisions to Make

| Area | Decision/output |
|---|---|
| Demo target | Assistance need, scenario, observable outcome, acceptance journey |
| Ownership/auth | Account/workspace/customer relationships, signup, key scopes and revocation |
| Runtime and repo | Language, framework, package boundaries, tooling versions, shared-contract owner |
| Persistence | Raw evidence and brain version representation, transactions, migration owner |
| Execution | Worker/scheduler lifecycle, queue, update serialization, concurrency and retry bounds |
| Schedule | Monday time/timezone, scope, missed runs, disabled subscriptions, review freshness |
| Webhook | Registration, verification, payload version, signing, deduplication, retry/backoff, destination restrictions |
| Models | Provider/configuration, role prompts, structured validation, call limits, usage tracking |
| Matching | Vocabulary, cutoff eligibility, mechanism, missing-data and insufficient-support behavior |
| Hosting | Persistent storage, independent background execution, secrets, environments, rollback |
| Experience | Minimal setup/inspection/demo UI and presentation journey |

Webhook design must address destination validation and private-network access risks, secret handling, permission-scoped payloads, timeout/retry behavior, and duplicate delivery. These are design requirements to resolve, not implemented safeguards.

## Source Proposals to Evaluate

The supplied README proposes TypeScript, a monorepo, PostgreSQL, API/web/worker components, four concurrent jobs, tag overlap, and packages for contracts/storage/Librarian/Proactor/similarity. No stack or physical folder layout is accepted yet. Copying agent-os does not select Nest, Next, pnpm, shared ZSetup libraries, or a hosting vendor.

The source also proposes `/v1/customers`, event ingestion, job status, brain retrieval, query, manual evaluation, suggestions, and feedback routes. Keep them as candidates until authentication, scope, versioning, and asynchronous behavior are settled. Add schedule/settings/webhook contracts for the latest product direction.

## Architecture Task Completion

Produce accepted ADRs for durable choices, update this reference to describe the actual selected shape, agree shared data/API/webhook contracts and workstream owners, and define a verifiable first vertical slice. Only then scaffold the application. Leave unresolved decisions visible rather than quietly accepting source defaults.
