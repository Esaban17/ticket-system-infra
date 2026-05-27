# ---------------------------------------------------------------------------
# Registry module — provider version constraints.
#
# Pinned to match the root module's provider.tf so child and root agree on
# the same provider implementation. Bumping the root constraint without also
# bumping this file is a common cause of "Inconsistent provider version"
# init failures.
# ---------------------------------------------------------------------------

terraform {
  required_version = "~> 1.8"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
