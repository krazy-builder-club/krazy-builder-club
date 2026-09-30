# Cloud foundation

This module prepares identities, repository trust, private buckets, registry,
queues, KMS, an empty OpenRouter secret, and a project-scoped monthly billing
alert. Deployment mechanics and actual cloud status live in
[conventions](../../docs/conventions.md#4-release-and-deployment) and
[STATE](../../docs/STATE.md). It does not create the SQL instance, Cloud Run
services/job, or Scheduler target before the application contracts are available.

Use Terraform 1.14.9. With working billing and Google application credentials:

```bash
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform plan -out=foundation.tfplan
terraform -chdir=infra/terraform apply foundation.tfplan
python3 scripts/upload-openrouter-key.py --project krazy-builder-club-dev --file ~/Downloads/openrouter_api_key.md
```

Alternatively pass a short-lived `gcloud auth print-access-token` result through
`GOOGLE_OAUTH_ACCESS_TOKEN` in the process environment; never print it. Do not
commit credentials, state, saved plans, or secret versions. This module must not
be applied by the application deployment identity, which cannot administer IAM.

The initial apply uses ignored local state to bootstrap the private state bucket.
Before shared work, add a `backend "gcs" {}` block to `versions.tf` and migrate:

```bash
terraform -chdir=infra/terraform init -migrate-state \
  -backend-config=bucket=krazy-builder-club-dev-tfstate \
  -backend-config=prefix=foundation
```

Confirm the state is present remotely before retiring the local copy. Keep
bucket access restricted to infrastructure operators. A budget sends alerts,
it does not cap spending. Cloud SQL sizing and its always-on cost must be agreed
before provisioning that instance. Task queue retries are transport retries;
the database will own the architecture's model-attempt limits and idempotency.

After applying, populate the GitHub `development` environment variables
`GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and
`GCP_DEPLOY_SERVICE_ACCOUNT` using Terraform outputs. Only `main` is permitted
by both environment branch policy and federation's repository ID, owner ID,
branch and environment claims. No service-account JSON key is needed. Run the
manual Cloud authentication check then; it performs no deployment.
