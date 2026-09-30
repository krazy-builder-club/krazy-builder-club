# 0006 - API Contract Reference

- **Status:** Accepted
- **Date:** 2026-10-01

## Decision

Sanction `docs/api.md` as the canonical human-readable HTTP, upload, job and webhook contract. Its accepted design is implemented with shared Zod schemas and generated OpenAPI during scaffolding; the architecture reference links to it rather than duplicating route schemas.

## Rationale

Backend-first work needs reviewable interfaces before independent implementation. The source README's example routes omit uploads, schedules and delivery semantics. A separate indexed API reference keeps those details discoverable without overloading architecture or logical data descriptions.

## Consequences

Platform owns the shared contract; route/schema changes update generated OpenAPI and this reference in the same work. No endpoint exists merely because it is documented. Add the reference to the closed docs index.
