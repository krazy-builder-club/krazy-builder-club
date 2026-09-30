# Krazy Builder Club

**BOB** is the working product name: a hosted API that turns supplied customer information into persistent, evidence-backed Markdown memory and scheduled suggestions. The final name is open.

Context: Tectonic Hackathon, KBC challenge. The selected architecture is Google Cloud with a TypeScript/Hono API, Cloud SQL PostgreSQL, Cloud Storage, and scheduled Cloud Run workers. The MVP is API-only, with operator-provisioned workspaces/keys and no signup frontend. This repository contains documentation and a prepared deployment foundation; no application has been deployed. See [current state](docs/STATE.md) for cloud status and [deployment conventions](docs/conventions.md#4-release-and-deployment) for setup.

## Product Direction

- **Librarian:** maintains each customer's memory from incoming transactions, metadata, notes, and corrections; supports grounded read-only questions.
- **Proactor:** automatically reviews customer context on a schedule and proposes useful next steps. Monday-morning insights delivered to a configured webhook are the initial example.
- **Memory:** separates personality/preferences, situation, goals, and evidence; keeps raw inputs distinct from summaries.
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

No application run commands exist. See [conventions](docs/conventions.md#5-verification) for documentation checks. The archived brief's `pnpm` commands are future proposals.

Repository: [neilord/krazy-builder-club](https://github.com/neilord/krazy-builder-club).
