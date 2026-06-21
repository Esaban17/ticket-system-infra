# Backend configuration for the staging environment (Pattern A — Delivery 4).
# Passed via: terraform init -backend-config=envs/staging/backend-staging.hcl
#
# Uses the SAME S3 bucket and DynamoDB lock table as dev but a DIFFERENT state
# key, so dev and staging state files never collide (ADR 0012).

bucket         = "ticket-system-tfstate-galileo-pdds"
key            = "infra/staging/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "ticket-system-tflock"
encrypt        = true
