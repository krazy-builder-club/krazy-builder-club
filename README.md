# Krazy Builder Club

**BOB** is the working product name: a hosted API that turns supplied customer information into persistent, evidence-backed Markdown memory and scheduled suggestions. The final name is open.

Context: Tectonic Hackathon, KBC challenge. The selected architecture is Google Cloud with a TypeScript/Hono API, Cloud SQL PostgreSQL, Cloud Storage, and scheduled Cloud Run workers. The MVP is API-only, with operator-provisioned workspaces/keys and no signup frontend. The platform scaffold and the Librarian run locally: customer creation with an initial brain, event intake, Markdown brain reads, plain-English questions, jobs, the worker runtime and the operator CLI. The Proactor, uploads and delivery are not built yet, and nothing is deployed. See [STATE](docs/STATE.md).

## Product Direction

- **Librarian:** maintains each customer's memory from incoming transactions, metadata, notes, and corrections; supports grounded read-only questions.
- **Proactor:** automatically reviews customer context on a schedule and proposes useful next steps. Monday-morning insights delivered to a configured webhook are the initial example.
- **Memory:** a Situation / Personality / Experience document tree with explicit goals, a generated overview and an evidence ledger ([data](docs/data.md#memory-contract)); raw inputs stay separate from memory.
- **Intelligence:** existing models and permitted historical comparisons; synthetic prototype data and no custom model training.

The proactive cycle is automatic. A person's action or Librarian update is not the default trigger for Proactor. Personal identification locates a customer record; authorization separately establishes access.

## Start Here

| Read | Purpose |
|---|---|
| [Docs index](docs/README.md) | Information map and governance |
| [Product reference](docs/product.md) | Requirements, role boundaries, and questions |
| [Current state](docs/STATE.md) | Current phase and next work |
| [Agent entry point](AGENTS.md) | Coding and management agent onboarding |
| [Architecture](docs/architecture.md) | Selected stack, service boundaries and implementation sequence |
| [API contract](docs/api.md) | Planned ingestion, reads, schedules and webhooks |
| [Source register](docs/sources/README.md) | Provenance and precedence |

## Run Locally

Requires Node 24, pnpm 11 and Docker. Copy `.env.example` to `.env` and set its secrets.

```bash
pnpm install
```

```bash
pnpm db:up
```

```bash
pnpm db:migrate
```

```bash
pnpm operator dev:login-roles --api-password <pw> --worker-password <pw>
```

```bash
pnpm operator workspace:create --name "Demo Bank"
```

```bash
pnpm operator key:create --workspace <workspace_id> --name demo --capabilities all --all-customers
```

```bash
pnpm dev:api
```

The API serves `/openapi.json` on port 3000. `pnpm dev:worker` runs the worker with the in-process local driver; point its `DATABASE_URL` at the worker login role. The Librarian needs a model: set `OPENROUTER_API_KEY` in the worker's environment (default model `google/gemini-3.8-flash`, override with `LIBRARIAN_MODEL`/`QUERY_MODEL`). Without a key, Librarian and query jobs stay queued. The full check is `pnpm verify` (see [testing](docs/testing.md)).

### Librarian Quickstart

With `KEY` set to the issued API key: create a customer (this also creates the empty brain), send information, then read the brain or ask a question.

```bash
curl -s localhost:3000/v1/customers -H "Authorization: Bearer $KEY" -H 'content-type: application/json' -d '{"external_id":"demo-001"}'
```

```bash
curl -s localhost:3000/v1/customers/$CUSTOMER/events -H "Authorization: Bearer $KEY" -H "Idempotency-Key: $(uuidgen)" -H 'content-type: text/plain' --data 'I start a new job in Antwerp in November and want to move before December.'
```

```bash
curl -s "localhost:3000/v1/customers/$CUSTOMER/brain?format=markdown" -H "Authorization: Bearer $KEY"
```

```bash
curl -s localhost:3000/v1/customers/$CUSTOMER/query -H "Authorization: Bearer $KEY" -H "Idempotency-Key: $(uuidgen)" -H 'content-type: application/json' -d '{"question":"What is this customer planning?","wait_seconds":20}'
```

Repository: [neilord/krazy-builder-club](https://github.com/neilord/krazy-builder-club).
