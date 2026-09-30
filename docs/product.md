# Product Reference

This is the canonical consolidated product context. Provenance and precedence are in [sources](sources/README.md). Implementation suggestions remain proposals until explicitly decided.

## Purpose and Audience

BOB is a hosted service with an API for ingesting information about identified customers, maintaining readable memory, answering questions, and supplying proactive insights. A bank assistant such as Kate, an adviser interface, or a customer-facing integration can consume that context. We are not building a bank or a replacement for Kate.

An account represents the service operator/developer; a customer represents a person whose information is managed. Workspace isolation and email signup/API keys are carried forward from the supplied brief as intended capabilities. Their exact ownership and authentication design remains open. Identifiers route requests; they do not grant permission.

## Carried-Forward Requirements

| Requirement | Source |
|---|---|
| Separate Markdown brain for each customer; raw inputs remain separate | Supplied brief |
| Transactions, metadata, notes, corrections as inputs | Supplied brief and latest discussion |
| Personality/preferences separate from situation, goals, and intent | Supplied brief |
| Existing LLMs without custom training for the proof of concept | Supplied brief |
| Compare personality and situation across authorized historical cases | Supplied brief |
| Hosted API with information-in and understanding-out capabilities | Both |
| Automatic proactive processing; user action is not its default trigger | Latest discussion, takes precedence |
| User-configured webhook for scheduled information and insights | Latest discussion; delivery design remains open |
| Approximately 100 synthetic customer profiles for demonstration | Supplied brief; latest discussion mentions 100 items |
| Central shared docs and coordinated independent workstreams | Both |

The exact meaning of the latest discussion's "100 items" is open. The brief's 100 customers is the planning reference, not permission to generate fixtures during onboarding.

## Librarian

Maintains supported memory from information supplied to the service. Reads incoming events and prior relevant memory, distinguishes facts from hypotheses, preserves source references, applies scoped corrections, and retires stale context. A read-only query answers from that customer's permitted context without silently rewriting memory.

The discussion's phrase "keeps it out" is ambiguous; the brief consistently describes retaining and organizing supplied information. Use that interpretation until clarified. Librarian ingestion can happen when input arrives; this is distinct from triggering proactive suggestions.

## Proactor

Reads customer memory on an automatic schedule and proposes useful information or next steps. Monday morning is the initial example. An integration registers its webhook URL in settings and receives scheduled outputs. Whether delivery goes directly to a repository automation or another consumer is undecided.

The service initiates the scheduled run without requiring a person to take an action. The brief's automatic ingestion-to-Proactor chain is superseded as the default behavior by the latest clarification. Explicit query/manual evaluation may be useful capabilities, but must not replace automatic scheduling.

Proactor considers goals, current evidence, authorized comparison summaries, previous suggestions, dismissals, and communication preferences. It can return no action. It does not freely rewrite memory or execute payments. Responses/corrections return through the information layer for Librarian processing.

Proposed action vocabulary from the brief: `ASK_A_QUESTION`, `SHOW_INFORMATION`, `PREPARE_ACTION`, `SCHEDULE_REMINDER`, `HAND_OFF`, `DO_NOTHING`. It is not yet an accepted API enum or permission to perform external actions.

## Comparison and Evidence

One hundred customers means one hundred stored memories, not one hundred continuously running models. Compare separate canonical personality and situation tags using historical snapshots with observed follow-up outcomes. The comparison mechanism and thresholds are open.

The brief proposes forecasting a useful assistance need within 30 days, with moving-related help as the first scenario. Those are candidates to decide during architecture. Broader next-transaction prediction was discussed, but is not an established prototype capability.

Show evidence, uncertainty, and reference counts. A cohort frequency is not a calibrated individual probability. Personal corrections override generic patterns. Without observed outcomes, label suggestions as hypotheses; with insufficient reference support, ask for relevant context or return no action. Detailed logical information requirements live in [data](data.md).

## Boundaries

Prototype data is synthetic. No custom model training, real banking/payment execution, automatic credit or insurance decisions, billing, or claim of production readiness is included. Cross-customer matching is in the product direction; autonomous customer-agent conversations and an unrestricted swarm are unnecessary.

Input format breadth, API routes, frontend scope, and adapter options are open. Do not promise arbitrary file parsing or URL fetching. MCP is an optional future adapter, not an initial requirement.

## Questions for Architecture

1. What first assistance need, scenario, and observable outcome should the demo prove?
2. Is scheduling per customer or per integration/workspace; what defines an active customer?
3. Which timezone and delivery time define Monday morning, and what happens when runs are missed?
4. Does each review deliver one digest or separate customer insights? Should a no-action review deliver anything?
5. What identifies an integration and its permitted customer set, and how is webhook setup verified?
6. What correction, dismissal, and freshness rules govern queued insights?
7. Who owns each workstream, and what presentation format and deadline apply?

Stack selection and physical contracts belong to the next task. Current task ordering lives in [STATE](STATE.md).
