terraform {
  required_version = "~> 1.8"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # NO backend block on purpose. This workspace manages the remote state
  # backend itself — using S3 as a backend here would create a circular
  # dependency. State is kept local and committed to git (see project
  # .gitignore exception for infra/bootstrap/terraform.tfstate).
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "ticket-system"
      ManagedBy   = "terraform"
      Workspace   = "bootstrap"
      Description = "Remote state backend resources"
    }
  }
}
