# 0007 - Cloud Deployment Foundation

- **Status:** Accepted
- **Date:** 2026-10-01

## Decision

Prepare a dedicated `krazy-builder-club-dev` Google Cloud project in
`europe-west1`. Use Terraform for the cloud foundation, Google Secret Manager
for the supplied OpenRouter key, and GitHub OIDC federation restricted to this
repository's immutable IDs, `main`, and the `development` environment. Keep
infrastructure administration separate from the application deployer.

The latest user clarification selects OpenRouter unless hackathon-funded
Vertex AI is confirmed. No such entitlement has been verified. The deployment
foundation does not enable Vertex AI or require Google model credentials.
This supersedes [ADR 0003](0003-google-cloud-backend-stack.md) only for the
model-provider default. The reconciled architecture uses OpenRouter; runtime
model IDs and provider capabilities still require scaffold smoke tests.

## Rationale

The authenticated CLI can create projects and the GitHub account administers
this repository. Federation avoids exporting long-lived service-account keys.
Secret values uploaded outside Terraform stay out of state and GitHub logs.
A dedicated project isolates this prototype from the existing production project.

## Consequences

The Google project exists, but its billing linkage was rejected for billing
project quota exhaustion. Paid APIs, secret upload, and resource creation are
blocked. Terraform validation is useful preparation and is not evidence of a
successful cloud apply. Application image builds, migrations, service deployment,
scheduler activation and rollback are deferred until architecture and executable
entrypoints are handed off. Current state belongs in [STATE](../STATE.md).
