# 0007 - Database Roles and Cross-Tenant Definer Functions

- **Status:** Accepted
- **Date:** 2026-10-01

## Decision

The schema-owning migrator owns the application database (and so its `public` schema). Migrations create three `NOLOGIN NOBYPASSRLS` group roles: `bob_api`, `bob_worker` and `bob_system`. Deployments grant `bob_api`/`bob_worker` to login users (Cloud SQL IAM users in the cloud, local roles in development and tests); `bob_system` is never granted to a login role.

Every tenant table has `ENABLE` and `FORCE ROW LEVEL SECURITY` with a `workspace_id = bob_current_workspace()` policy, including for the owner. The only cross-workspace operations are `SECURITY DEFINER` functions owned by `bob_system` with a pinned `search_path`: API-key lookup by exact hash (API and worker), and outbox claim/dispatch plus lease and lost-dispatch reconciliation (worker only). `bob_system` reaches other workspaces only through narrow policies on `api_keys`, `workspaces`, `jobs` and `outbox`.

## Rationale

[ADR 0003](0003-google-cloud-backend-stack.md) and the data reference require runtime roles that cannot bypass RLS, a narrow key lookup that is not an unscoped reader, and a dispatcher that sees only operational IDs. Cloud SQL does not offer superuser or `BYPASSRLS` to application roles, so cross-tenant reach has to come from policies scoped to a dedicated non-login owner rather than from a privileged login. Database ownership gives the migrator the grant rights it needs on `public` without superuser.

## Consequences

Tests run against PostgreSQL 17 with a non-superuser migrator and login roles in `bob_api`/`bob_worker`. A superuser connection would silently bypass RLS and invalidate those tests. A new tenant table must be added to `TENANT_TABLES` and the security migration; a test fails if any table with `workspace_id` lacks forced RLS. Adding a definer function needs the same pinned `search_path`, `REVOKE ... FROM PUBLIC`, and explicit grants. Customer-key grants remain application checks on top of workspace RLS.
