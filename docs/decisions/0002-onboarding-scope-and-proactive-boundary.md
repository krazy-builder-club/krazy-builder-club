# 0002 - Onboarding Scope and Proactive Boundary

- **Status:** Accepted
- **Date:** 2026-10-01

## Decision

Complete documentation and management onboarding first; leave technical architecture and application implementation to the next task, as the user requested. Preserve the supplied brief's technical defaults as proposals.

Carry forward the latest user clarification that Librarian processes supplied information and Proactor automatically reviews context on a schedule, with configured webhook delivery as the initial integration direction. Customer action or a Librarian update is not the default proactive trigger.

## Rationale

The attachment describes a broader implementation handoff, while the actual request stages architecture afterward. The latest discussion distinguishes the scheduled Proactor from Librarian and refines the attachment's event-triggered proactive loop.

## Consequences

No stack, endpoints, physical schema, fixtures, or deployment is built in onboarding. Architecture must explicitly decide scheduling scope/timezone, delivery semantics, authorization, freshness, and failure behavior. Monday morning is an example to formalize, not a silently hardcoded timestamp. Corrections must still invalidate stale insights without waiting for a scheduled review.
