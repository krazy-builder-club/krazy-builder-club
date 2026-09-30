data "google_project" "current" {}
locals {
  services = toset([
    "run.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com",
    "iam.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com",
    "sqladmin.googleapis.com", "storage.googleapis.com", "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com", "cloudkms.googleapis.com", "logging.googleapis.com",
    "monitoring.googleapis.com", "billingbudgets.googleapis.com"
  ])
}
resource "google_project_service" "enabled" {
  for_each           = local.services
  service            = each.value
  disable_on_destroy = false
}
resource "google_service_account" "identity" {
  for_each     = toset(["github-deployer", "bob-api", "bob-worker", "bob-migrate", "bob-task-invoker", "bob-scheduler"])
  account_id   = each.value
  display_name = "BOB ${each.value}"
  depends_on   = [google_project_service.enabled["iam.googleapis.com"], google_project_service.enabled["iamcredentials.googleapis.com"], google_project_service.enabled["sts.googleapis.com"]]
}
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "BOB GitHub Actions"
  depends_on                = [google_project_service.enabled["iam.googleapis.com"]]
}
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.owner_id"      = "assertion.repository_owner_id"
  }
  # Immutable IDs prevent deleted/recreated repository names acquiring access.
  # Pull requests and branch workflows cannot impersonate the deployer.
  attribute_condition = "assertion.repository_id == '${var.github_repository_id}' && assertion.repository_owner_id == '${var.github_owner_id}' && assertion.ref == 'refs/heads/main' && assertion.sub == 'repo:neilord/krazy-builder-club:environment:development'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}
resource "google_service_account_iam_member" "github" {
  service_account_id = google_service_account.identity["github-deployer"].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}
resource "google_project_iam_member" "deployer_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.identity["github-deployer"].email}"
}
resource "google_service_account_iam_member" "deploy_runtime" {
  for_each           = toset(["bob-api", "bob-worker", "bob-migrate"])
  service_account_id = google_service_account.identity[each.value].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.identity["github-deployer"].email}"
}
resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "bob"
  format        = "DOCKER"
  depends_on    = [google_project_service.enabled]
}
resource "google_artifact_registry_repository_iam_member" "publisher" {
  location   = var.region
  repository = google_artifact_registry_repository.images.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.identity["github-deployer"].email}"
}
resource "google_storage_bucket" "files" {
  name                        = "${var.project_id}-files"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  depends_on                  = [google_project_service.enabled]
}
resource "google_storage_bucket" "state" {
  name                        = "${var.project_id}-tfstate"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning { enabled = true }
  depends_on = [google_project_service.enabled]
}
resource "google_secret_manager_secret" "openrouter" {
  secret_id = "openrouter-api-key"
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
  depends_on = [google_project_service.enabled]
}
# Secret bytes are deliberately uploaded outside Terraform and its state.
resource "google_secret_manager_secret_iam_member" "model_key" {
  secret_id = google_secret_manager_secret.openrouter.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.identity["bob-worker"].email}"
}
resource "google_cloud_tasks_queue" "work" {
  for_each = toset(["memory", "analysis", "delivery"])
  name     = "bob-${each.value}"
  location = var.region
  rate_limits {
    max_concurrent_dispatches = 2
    max_dispatches_per_second = 2
  }
  retry_config {
    max_attempts       = 5
    max_retry_duration = "86400s"
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 5
  }
  depends_on = [google_project_service.enabled]
}
resource "google_kms_key_ring" "webhooks" {
  name       = "bob"
  location   = var.region
  depends_on = [google_project_service.enabled]
}
resource "google_kms_crypto_key" "webhooks" {
  name            = "webhook-signing"
  key_ring        = google_kms_key_ring.webhooks.id
  rotation_period = "7776000s"
  lifecycle { prevent_destroy = true }
}
resource "google_billing_budget" "development" {
  billing_account = var.billing_account
  display_name    = "BOB development monthly alert"
  budget_filter { projects = ["projects/${data.google_project.current.number}"] }
  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_alert_usd)
    }
  }
  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.9 }
  threshold_rules { threshold_percent = 1.0 }
  depends_on = [google_project_service.enabled]
}
