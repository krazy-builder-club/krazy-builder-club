# 0003 - Google Cloud Backend Stack

- **Status:** Accepted
- **Date:** 2026-10-01

## Decision

Select Node 24/TypeScript with Hono, Zod/OpenAPI, Drizzle and PostgreSQL 17 on Cloud SQL. Deploy API and IAM-protected worker to Cloud Run; use GCS for original files, Cloud Tasks for transport, Scheduler for clock ticks, and Vertex AI through the Google Gen AI SDK for inference. Terraform owns infrastructure. Exact dependency versions are pinned when the scaffold is built.

Build an API-only MVP. Provision initial workspaces/keys with an IAM-restricted operator CLI; defer self-service email signup and a frontend. This supersedes ADR 0002's temporary deferral of architecture now that the user has requested that phase, and narrows the source brief's signup intent.

## Rationale

The user explicitly prefers Google Cloud and database-first backend development. SecondSell demonstrates a small Hono/Zod API with Drizzle and GCS; LeadFilter and the template demonstrate the Cloud Run/Postgres deployment pattern. Flexible JSONB sources plus transactional versioning and historical joins suit PostgreSQL better than a document-only design. A full SaaS template introduces unrelated billing, UI, private-package, and integration dependencies.

## Consequences

Share one backend codebase with two entrypoints; no per-customer databases or mandatory private packages. Preserve source files separately from database metadata and Markdown. Pin/tool-test dependencies and validate cloud/model availability during implementation. No infrastructure is provisioned by accepting this design; deployment inputs and cost review remain implementation work.
