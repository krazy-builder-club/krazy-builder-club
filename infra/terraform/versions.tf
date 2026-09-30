terraform {
  required_version = "= 1.14.9"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }
  # State starts locally; migrate to the private bootstrap bucket before shared applies.
}
provider "google" {
  project = var.project_id
  region  = var.region
}
