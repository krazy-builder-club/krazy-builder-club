# BOB — Customer Memory and Proactive Intelligence

> Turn customer data into a living Markdown brain, compare personality and situation, and propose useful next steps without training a new model.

**Working title:** BOB. The final product name is not decided.  
**Context:** Tectonic Hackathon, KBC challenge.  
**Status:** Project specification and shared implementation context. This README does not claim that the application, endpoints, deployment, or prediction quality have been implemented or verified.

This is the central handoff for the team and its coding agents. It consolidates the discussions rather than documenting an existing codebase. Requirements drawn from the discussions are separated from proposed implementation defaults. References `[S1]`–`[S4]` are explained at the end.

## 1. What we are building

We are building a **hosted service with an API** that accepts information about customers and turns it into persistent, readable customer memory. Existing LLMs maintain and interpret that memory. No custom neural network training or fine-tuning is required for the proof of concept.

The product has two main doors:

1. **Information in:** send transactions, metadata, notes, or corrections. The **Librarian** updates the relevant customer's brain.
2. **Understanding out:** ask questions about that customer, or let the **Proactor** propose useful next steps using their brain, recent events, and patterns among similar customers.

Each customer has a separate brain represented by Markdown documents. Raw source data remains separate from these summaries. The proposed similarity mechanism compares **personality/preferences** and **situation** as distinct dimensions. `[S1][S2][S3]`

The platform supplies context and suggestions to a bank assistant such as Kate, a customer-facing application, or an adviser interface. We are not building a complete bank, replacing Kate, or claiming to reproduce a person's entire identity.

**Working pitch:**

> BOB turns fragmented customer data into an evolving customer brain. A Librarian maintains it; a Proactor combines it with similar historical situations to anticipate potentially useful help. Every suggestion can be traced to evidence, corrected, or dismissed.

KBC's brief asks for a scalable approach to understanding, supporting, and guiding customers—not merely another isolated feature. Its questions cover signals, situation and intent, automatic adaptation, and continuity across channels. `[S4, pp. 3–4]`

## 2. Decisions and boundaries

### Requirements carried forward from the discussions

| Area | Working requirement |
|---|---|
| Customer memory | One separate Markdown brain per customer. |
| Inputs | Transactions and existing customer metadata, with a path for other supplied information. |
| Personality | A compact set of descriptive keywords/preferences, separate from current situation. |
| Situation | Current circumstances, such as renting, moving, or customer-declared household context. |
| Intelligence | Existing LLMs; no custom model training for the prototype. |
| Roles | Librarian maintains knowledge; Proactor interprets it and proposes next steps. |
| Comparison | Compare customers using personality and situation, rather than analysing each person entirely in isolation. |
| Service | Hosted API that manages storage; account signup by email and an API key. |
| Demo data | Mock bank data; approximately 100 synthetic customers is the discussed demonstration scale. |
| Collaboration | One central README, shared contracts, and separate implementation areas for parallel work. |

### Proposed defaults—not previously settled team decisions

| Decision | Default for implementation |
|---|---|
| Runtime | TypeScript monorepo; web interface, API, and background worker. |
| Persistence | PostgreSQL for source events, versioned brains, jobs, and outputs. |
| Model | One existing model initially, with separate Librarian and Proactor configurations. Provider/model remain configurable. |
| Matching | Normalised tag overlap; no embedding service or learned matching model initially. |
| Forecast target | For the first demo, predict a potentially useful assistance need within 30 days—not an exact next purchase. |
| API ownership | An account owns a workspace. Keys are scoped to that workspace and permitted customer records. |
| Processing | Event-driven updates plus scheduled reviews; bounded concurrency, initially four jobs. |
| User interface | Small developer/demo dashboard, not a full consumer banking app. |

These defaults make the specification implementable. They can be changed explicitly before dependent work starts. The hosting vendor, authentication provider, and exact web framework have not been selected.

### Not in this proof of concept

Custom model training, real banking/payment execution, automatic credit or insurance decisions, billing, a production regulatory assessment, an unrestricted agent swarm, or a claim of validated human personality prediction.

Cross-customer matching **is** part of this prototype. Autonomous conversations between customers' agents are not required to implement it.

## 3. Who signs up, and whose data is stored?

An **account** is the developer or operator using our service. A **workspace** is that account's isolated data environment. A **customer** is a person represented inside it.

Proposed flow:

1. Sign up using email and create a workspace.
2. Generate a workspace-scoped API key.
3. Create customer records or load the synthetic fixture set.
4. Send events for a customer.
5. Inspect their Markdown brain, ask questions, and retrieve suggestions.
6. Submit corrections and observe the resulting changes.

A bank integration can manage multiple customers in one authorised workspace. A personal integration can use a key restricted to one customer. These are not the same thing as giving every bank customer access to every other customer's data.

For early development, a seeded demo account/key can precede signup implementation. Email signup remains part of the intended service; disclose it as unfinished if it is not working at submission.

## 4. Customer brain: personality is not situation

Preserve the team's terminology, but give it a precise implementation meaning.

**Personality** is our compact description of preferences and observed tendencies. It is not a psychological diagnosis or a complete identity. Example tags: `budget_conscious`, `prefers_self_service`, `likes_planning`, `travel_interested`.

**Situation** describes current circumstances. Example tags: `renting`, `moving_soon`, `starting_new_job`. Household details should come from appropriate explicit information, not be invented from ambiguous purchases.

**Goals and intent** describe what the person wants: “Keep a €500 buffer” or “Organise the financial steps for my move.” They guide actions even when other customers behave differently.

**Evidence and feedback** distinguish observations, customer statements, unconfirmed hypotheses, corrections, and outdated information.

Example logical folder:

```text
customers/customer_001/
  overview.md
  personality.md
  situation.md
  goals.md
  interactions.md
```

Every material assertion needs its source, status, timestamp, and scope. A correction about one transaction must not silently become a permanent generalisation about the person.

```markdown
# Personality
- Tag: prefers_self_service
  Status: customer_confirmed
  Evidence: message_018

# Situation
- Tag: moving_soon
  Status: customer_confirmed
  Evidence: message_019
  Review: after the confirmed moving date

# Unconfirmed
- The recent furniture-store payment may relate to the move.
  Evidence: transaction_042
  Status: inferred
```

The same version of the brain also has structured tags for matching. Markdown is the readable representation; structured fields make comparisons consistent. The backend should save both from one validated update, not let them evolve independently.

Do not treat missing information as a negative trait. Do not infer sensitive personal characteristics from purchases for this demonstration. A merchant payment alone does not establish the exact item, its purpose, or its beneficiary.

## 5. Two agent roles, many customer memories

**One hundred customers means one hundred stored brains, not one hundred continuously running models.**

An agent role consists of instructions, tools, input context, and an output contract. A run temporarily loads the appropriate customer's context, performs its task, saves a validated result, and ends.

### Librarian

**Mission:** maintain a supported, current account of this customer's preferences, situation, goals, and history.

Inputs: new source events, relevant prior brain state, and permission-scoped historical queries.

Responsibilities: identify relevant information; distinguish facts from hypotheses; normalise tags; preserve evidence; apply corrections; retire outdated context; propose a new brain version.

Output: a structured memory patch that the backend validates and uses to render the Markdown documents and matching signature.

The Librarian also supports a **read-only query mode**. Answering a question must not silently rewrite memory or trigger a financial action.

Core instruction:

> Maintain this customer's brain using supplied evidence. Separate personality/preferences from situation and intent. Mark uncertain interpretations. Preserve corrections and their scope. Return a structured update with evidence references. Never invent missing facts or access another customer's private records.

### Proactor

**Mission:** identify a useful next step using this customer's context, current events, explicit goals, and permitted historical comparisons.

Inputs: the current brain version, deterministic financial features where needed, matching results, prior suggestions, and communication preferences.

Responsibilities: propose a candidate need; explain its basis; identify missing facts; select a permitted next step; avoid duplicates; respect corrections and dismissals; return no action when appropriate.

Allowed actions:

```text
ASK_A_QUESTION
SHOW_INFORMATION
PREPARE_ACTION
SCHEDULE_REMINDER
HAND_OFF
DO_NOTHING
```

The Proactor does not freely rewrite memory or execute payments. Responses and completed actions become events for the Librarian.

### Shared backend, not a master agent

Ordinary code handles authentication, scheduling, storage, comparisons, validation, and routing. There is no need for an all-seeing LLM above the customer brains. Adding roles requires a concrete responsibility that cannot be handled adequately by the existing workflow.

## 6. Prediction without training

The team's idea is to summarise people into core words, compare those summaries, and use existing LLMs to interpret the patterns. `[S1]`

**Keywords are inputs to the prediction process, not a forecast by themselves.** The proposed mechanism is:

```text
Personality + situation at a particular time
                  ↓
Find comparable historical customer snapshots
                  ↓
Inspect what happened afterward in those cases
                  ↓
Propose a possible next need for the current customer
                  ↓
Check their own goals, evidence, permissions, and current circumstances
```

This does not require fitting a new neural network. Updating memory, looking up comparable examples, and calling an existing model are separate from training model weights.

### 6.1 Fix the prediction target first

Proposed first target: **which assistance need might become relevant within the next 30 days?**

Possible outcome codes include `asked_for_move_planning` or `requested_expense_split_help`. Pick one clear demo journey before building fixtures. An outcome must be an observed event in a reference case—not an LLM's guess about what happened.

This narrower target is an implementation proposal. The discussion also considered predicting transactions; that broader ambition is not a demonstrated capability of this MVP.

### 6.2 Build comparable signatures

Use a small shared tag vocabulary. Keep separate lists for personality and situation. Store supporting evidence and whether a tag is confirmed or inferred.

A single natural-language summary can still be displayed, but the matcher should use canonical tag IDs rather than depend on different models choosing identical prose.

### 6.3 Find similar historical snapshots

Proposed initial heuristic:

```text
similarity = 0.4 × personality_overlap + 0.6 × situation_overlap

overlap(A, B) = size(intersection(A, B)) / size(union(A, B))
```

These weights are hand-chosen starting values, not learned or validated. If a dimension has no usable comparison, give it zero support and flag the missing context; never treat two empty lists as a perfect match.

Initial configurable defaults: up to ten matches, minimum similarity 0.5, and at least five distinct reference customers before showing a cohort rate. These are engineering thresholds, not statistical or privacy guarantees.

Filter to authorised reference cases within the workspace. Exclude the target customer, select at most one suitable snapshot per reference customer, and match without looking at future outcomes.

### 6.4 Look at what happened afterward

Each reference case needs a snapshot cutoff, a follow-up window, actual later outcome codes, and a record of whether that window is complete.

Illustrative wording—not a measured result:

> “Six of eight comparable historical cases requested moving help during the following 30 days.”

That describes those reference cases. It does **not** establish a calibrated 75% probability for this person. Display the reference count and, when available, the rate in the wider eligible reference set as context.

If there are no observed follow-up outcomes, label the result `hypothesis_only`, not a historical prediction. If there are too few suitable cases, return `insufficient_cohort_support`; ask a relevant question or rely on the customer's explicit intent.

### 6.5 Prevent future information from leaking into the prediction

Build each historical profile using only information available at its cutoff. Do not compare today's profile with another person's final profile after the outcome has already happened.

For a simulated forecast time, reference follow-up windows must already have completed before that time. Never use the target's later outcome in its input. Keep customers used for evaluation separate from the reference customers.

### 6.6 Convert a candidate forecast into useful help

The Proactor receives the target's context and aggregate matching evidence—not arbitrary private profiles of other customers. It checks whether the proposed need still applies.

If the customer says “My deposit is already handled,” suppress the deposit-related suggestion even if similar customers often needed help with it. Personal evidence overrides a generic cohort pattern.

A saved result should include:

```text
kind: hypothesis_only | cohort_supported
candidate_need
horizon_days
basis: customer_evidence | cohort_evidence | both
supporting_customer_event_ids
brain_version
cohort_support: match_count, outcome_count, optional_reference_rate
data_kind: synthetic | real_authorised
uncertainties
proposed_action
status: pending | approved | dismissed | superseded
```

Do not add an unexplained model-generated confidence percentage. Cohort association is not proof that an intervention will benefit the customer.

## 7. Storage and processing

### Keep the two source layers separate

**Raw layer:** supplied transactions, metadata, messages, and corrections, with source IDs and timestamps.

**Brain layer:** versioned personality, situation, goals, interactions, and evidence, exposed as Markdown and structured matching fields.

Suggestions, jobs, and reference-case outcomes are operational records around those layers.

Proposed minimal logical tables:

| Table | Purpose |
|---|---|
| `workspaces` / membership | Account ownership and access. |
| `api_keys` | Key hash, scope, expiry/revocation state; never reusable plaintext secrets in storage. |
| `customers` | Customer identifiers scoped to a workspace. |
| `events` | Original payload, source identity, received time, event time, and deduplication identity. |
| `brain_snapshots` | Versioned memory, Markdown documents, matching fields, and processing watermark. |
| `reference_cases` | Historical signatures, cutoffs, follow-up completeness, and observed outcome codes. |
| `jobs` | Queued ingestion, memory, or evaluation work and failure status. |
| `suggestions` | Candidate predictions/actions, evidence, brain version, and lifecycle. |

This is a proposed logical schema, not a requirement to create separate services for each table. Corrections can be stored as events rather than in another dedicated subsystem.

### Processing loop

```text
Event received
 → authenticate, validate size/type, persist, deduplicate
 → queue work for this customer
 → Librarian proposes a memory update
 → validate and atomically commit the new brain version
 → match eligible reference cases
 → Proactor proposes a next step or no action
 → validate permissions, relevance, freshness, and duplicates
 → persist output for the app/API
```

Run immediately for explicit requests and important corrections. Batch routine events. Schedule reviews for active goals and deadlines; a prompt saying “be proactive” does not wake up a sleeping process.

Use version checks or serial processing for a customer's memory updates. Recheck freshness before exposing a pending suggestion. A correction must supersede suggestions that depend on the corrected fact.

Set timeouts, retry limits, tool-call limits, and bounded concurrency. Keep the last valid brain when processing fails. Permission changes must be enforced by application code immediately, not only after the next model call.

## 8. API contract

All routes below are **proposed contracts to implement**. They are not currently available endpoints.

| Method and path | Purpose |
|---|---|
| `POST /v1/customers` | Create a customer in the authorised workspace. |
| `POST /v1/customers/{id}/events` | Submit a transaction, metadata update, note, or correction. |
| `GET /v1/jobs/{id}` | Inspect processing state and failures. |
| `GET /v1/customers/{id}/brain` | Retrieve the latest permitted brain version and Markdown documents. |
| `POST /v1/customers/{id}/query` | Ask a read-only question grounded in that customer's memory. |
| `POST /v1/customers/{id}/evaluate` | Queue a Proactor evaluation. |
| `GET /v1/customers/{id}/suggestions` | Retrieve current authorised suggestions. |
| `POST /v1/customers/{id}/feedback` | Confirm, reject, or correct a suggestion; create the corresponding event. |

The two conceptual doors remain ingestion and understanding. The additional routes expose their state, outputs, and feedback.

Example event body:

```json
{
  "source": "synthetic_bank_feed",
  "source_event_id": "evt_0042",
  "event_type": "transaction",
  "occurred_at": "2026-09-30T12:00:00Z",
  "payload": {
    "amount_minor": 10000,
    "currency": "EUR",
    "merchant": "Example Restaurant"
  }
}
```

Use a shared money convention; this example uses integer minor units. The backend, not the LLM, performs financial arithmetic.

Initially accept validated JSON and bounded plain-text notes inside a standard event envelope. “Any input” is the product direction, not a promise to parse every file type or fetch arbitrary URLs in the MVP.

Ingestion should return an accepted job ID and expose processing status. Query results should identify the brain version, evidence references, uncertainty, and whether newer input is still processing.

Authorisation must check both workspace membership and customer/key scope. An ID supplied in a URL, body, or tool argument is not permission. Apply the same rule to jobs, feedback, memory exports, and suggestions.

API keys stay server-side in integrations. The dashboard should use authenticated server routes rather than embed a privileged key in browser code. Add revocation, payload limits, rate limits, and secret-safe logging.

MCP is an optional adapter over these same scoped functions. It is not required for the initial API demonstration, and no separate MCP server per customer is planned.

## 9. Hosted service, local development, and GitHub

**Hosted API is the product direction.** Local development should run the same code against a local database. Choosing a particular cloud provider is separate from this architectural decision.

The hosted deployment needs persistent storage and a worker/scheduler execution mechanism. Do not assume an HTTP handler will keep running after its response has been sent. The platform owner must establish how queued jobs actually run on the chosen host.

GitHub contains code, shared prompts, schemas/migrations, documentation, and explicitly synthetic fixtures. It is **not the live database**.

Do not commit real transactions, real customer brains, passwords, API keys, or runtime database files. Synthetic example brains may be committed under a clearly labelled fixture directory. Keep actual configuration out of Git; supply variable names in `.env.example`.

For the demo, use synthetic data throughout. The prototype has not established permission to process real KBC data or production readiness.

## 10. Repository and parallel work

Proposed structure:

```text
README.md
AGENTS.md
apps/
  api/                    # HTTP API, auth integration, background entry points
  web/                    # Signup, API-key UI, customer/demo dashboard
packages/
  contracts/              # Shared types, schemas, tag vocabulary, action codes
  storage/                # Migrations and scoped repositories
  librarian/              # Memory updates, Markdown rendering, read-only Q&A
  proactor/               # Candidate needs, action selection, evaluation prompts
  similarity/             # Deterministic matching and cohort summaries
fixtures/
  synthetic-bank/         # Reproducible customers, events, reference outcomes
scripts/                  # Seed, replay, reset, evaluation utilities
```

`AGENTS.md` should point to this README and add coding instructions, not introduce a competing product specification.

Up to four independent workstreams:

| Owner | Main responsibility |
|---|---|
| Platform | API, auth, storage, worker, initial contracts and fixture loader. |
| Librarian | Brain update logic, evidence, Markdown views, query mode. |
| Proactor | Similarity matcher, reference cases, candidate forecasts, action output. |
| Experience | Dashboard, signup/key screens, event replay UI, demonstration flow. |

Combine responsibilities when there are fewer team members. These workstreams need not be separate microservices.

Agree contracts before parallel implementation: `SourceEvent`, `BrainSnapshot`, `ProfileSignature`, `ReferenceCase`, `CohortEvidence`, and `Suggestion`. Start from shared fixtures. Keep contract and migration ownership explicit; coordinate changes rather than letting several coding agents redefine the same interface independently.

Use branches and small pull requests. Code-agent review can assist, but the team still runs tests and reviews changes. Do not move another workstream's public interfaces without agreement.

## 11. Build order and run contract

### First: make one customer work end to end

Scaffold the workspace, contracts, persistent store, and synthetic demo key. Implement event ingestion, one Librarian update, Markdown inspection, and one grounded query.

### Second: add comparison and proactive output

Implement the signature matcher and historical reference fixtures. Add the Proactor and scheduled/manual evaluation. Prove that corrections change outputs and that unsupported cases return uncertainty or no action.

### Third: make the service usable

Add signup and scoped API-key management, complete the dashboard, load approximately 100 synthetic customers, and deploy the API with a working worker.

### Fourth: test and demonstrate

Run cross-customer access tests, prediction-hindsight checks, duplicate-event tests, and the security audit. Record the working journey, not screens that imply unimplemented capabilities.

### Commands the scaffold should provide

The commands below are a target interface. They will not work from this README alone and must be verified once code exists.

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed:demo
pnpm dev
# In another terminal, if dev does not start it:
pnpm worker
pnpm test
pnpm demo:replay
```

The scaffolder must pin tooling versions and document any changes to these commands. Configure `DATABASE_URL`, `MODEL_PROVIDER`, `MODEL_NAME`, `MODEL_API_KEY`, and `APP_BASE_URL`; add the selected authentication provider's actual required settings when chosen. A demo flag must not bypass authorisation.

Measure model calls, latency, failures, and actual provider usage. No cost, throughput, or million-customer scalability numbers are established by this specification.

## 12. Demonstration and acceptance criteria

### Proposed demonstration: moving-related assistance

Use a customer who has explicitly said they are moving, with a small preference signature. Show the raw source, the personality/situation Markdown, and comparable historical cases with observed follow-up events.

The Proactor proposes relevant help and displays the evidence and limitations. The customer says a specific task is already handled. The Librarian updates the brain, and the related suggestion disappears. A second customer with different preferences receives a different appropriate action or no action.

Show the same updated context in the question-answering and adviser/demo views. Replay the input and verify that it does not create a duplicate suggestion.

All displayed cohort counts must be calculated from fixtures. Label them synthetic. This proves the workflow, not real-world predictive performance.

### Definition of done for the core prototype

- Authenticated event ingestion, persistent memory, Markdown retrieval, and read-only Q&A work.
- Personality and situation are separate and evidence-backed.
- Matching uses canonical tags and historical snapshots, not future target information.
- The Proactor produces a supported candidate, an explicit hypothesis, or an insufficient-support/no-action result.
- Feedback updates context and supersedes affected suggestions.
- Jobs survive ordinary processing failures without corrupting the latest valid brain.
- Cross-workspace and customer-scope tests cover every data route.
- Duplicate events, stale outputs, and instructions hidden in input data are tested.
- Public repository contents and logs contain no secrets or confidential customer data.
- The final README states what actually works and what remains unfinished.

For forecast evaluation, use separate held-out synthetic customers and record results against subsequent fixture outcomes. Report reference coverage and compare with a simple overall-outcome-frequency baseline. Any reported accuracy applies only to that synthetic setup; no real-world validation claim follows from it.

### Hackathon submission

The guide requires a short description, a demo video **under three minutes**, the GitHub repository link, and Aikido screenshots. The audit contributes **10%** of assessment; preserve baseline and post-fix screenshots. `[S4, pp. 6–7, 11]`

Keep the repository public and accessible through judging, document how to run the implemented version and unfinished work, and make no code or submission changes after final submission. Never upload secrets or confidential data. `[S4, p. 12]`

This longer file is the team's implementation handoff. Before submission, update its status and move the verified quickstart and working-demo description to the top so judges do not have to infer what was built.

## 13. Open decisions and source provenance

Before parallel coding, the scaffold owner should record the selected web/auth/hosting stack, exact forecast target and outcome code, and first synthetic scenario. Do not spend this decision window debating model training or adding more agent roles; neither is needed for the agreed proof of concept.

**[S1] Latest team discussion in the user message.** Personality keywords separate from situation; comparison without custom training; Librarian and Proactor; hosted API, email signup/key, mock data, and a shared repository README.

**[S2] Earlier brainstorming supplied as `Pasted text(2).txt`.** Customer representation behind Kate, event-triggered updates, and the discussion of proactive assistance and bank/customer value.

**[S3] Extended discussion supplied as `Pasted markdown(5).md`.** Raw transactions/metadata versus per-person Markdown brains; information-in/question-out service; comparison across people; existing-model approach; approximately 100 synthetic customer profiles. The discussion also explores training and swarms, but does not establish them as implemented or necessary.

**[S4] `Tectonic Hackathon - Participants Guide.pdf`.** KBC brief on pages 3–4; security process on pages 6–7; submission on page 11; rules on page 12.

The matching formula, thresholds, schema, endpoint paths, repository layout, and operating safeguards are **proposed implementation details**, not claims that the team already decided or built them. No new market research, bank integration verification, or predictive validation is included in this document.
