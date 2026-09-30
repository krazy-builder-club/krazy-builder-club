# 0005 - Durable Scheduled Work

- **Status:** Accepted
- **Date:** 2026-10-01

## Decision

Use PostgreSQL job/outbox records with Cloud Tasks delivery to a private Cloud Run worker. A UTC Scheduler tick drives enqueue reconciliation and database-owned weekly subscriptions, initially Monday 09:00 Europe/Brussels. Proactor's scheduled clock remains independent of ingestion; corrections immediately invalidate stale outputs.

Deliver actionable per-customer insights to verified HTTPS webhooks with stable delivery IDs and HMAC signatures. Do not send no-action reviews or raw/private cohort profiles. Define replay, timeout, retry, and missed-run semantics in the references.

## Rationale

HTTP handlers must not be relied on for post-response work. Scheduler and Tasks may repeat deliveries, and queue creation cannot be atomic with a database commit. Durable occurrences, an outbox, revision checks and idempotent handlers address those gaps without Redis or a permanent polling server.

## Consequences

Implementation must test dispatch recovery, leases, duplicate ticks/tasks, stale-output suppression, webhook SSRF defenses, and revoke/retry behavior. Cloud task payloads contain references rather than source data. Cloud Run Jobs handle migrations and later work that exceeds bounded HTTP-task execution.
