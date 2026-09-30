# Krazy Builder Club

**BOB** is the working product name: a hosted API that turns supplied customer information into persistent, evidence-backed Markdown memory and scheduled suggestions. The final name is open.

Context: Tectonic Hackathon, KBC challenge. This repository currently contains project documentation and the agent management workflow. No application, database, API, scheduler, or deployment exists yet. Technical architecture is the next task.

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
| [Architecture brief](docs/architecture.md) | Next phase's decision agenda |
| [Source register](docs/sources/README.md) | Provenance and precedence |

No application run commands exist. See [conventions](docs/conventions.md#5-verification) for documentation checks. The archived brief's `pnpm` commands are future proposals.

Repository: [neilord/krazy-builder-club](https://github.com/neilord/krazy-builder-club).
