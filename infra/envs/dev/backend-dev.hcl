# Backend configuration for the dev environment (Pattern A — Delivery 4).
# Passed via: terraform init -backend-config=envs/dev/backend-dev.hcl
#
# The key includes the environment so dev and staging state files never collide
# in the same S3 bucket (ADR 0012). State was migrated from the legacy key
# "infra/terraform.tfstate" via terraform init -migrate-state.

bucket         = "ticket-system-tfstate-galileo-pdds"
key            = "infra/dev/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "ticket-system-tflock"
encrypt        = true
