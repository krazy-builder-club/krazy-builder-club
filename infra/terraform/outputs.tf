output "project_id" { value = var.project_id }
output "workload_identity_provider" { value = google_iam_workload_identity_pool_provider.github.name }
output "deployment_service_account" { value = google_service_account.identity["github-deployer"].email }
output "artifact_repository" { value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}" }
output "state_bucket" { value = google_storage_bucket.state.name }
output "openrouter_secret" { value = google_secret_manager_secret.openrouter.id }
