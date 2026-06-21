# ---------------------------------------------------------------------------
# Remote state backend — partial configuration (Delivery 4, Pattern A).
#
# The bucket/key/lock values are NO LONGER hardcoded here. They are provided
# via per-environment backend config files:
#   infra/envs/dev/backend-dev.hcl
#   infra/envs/staging/backend-staging.hcl
#
# Initialize for each environment:
#   terraform init -backend-config=envs/dev/backend-dev.hcl
#   terraform init -backend-config=envs/staging/backend-staging.hcl
#
# The state KEY includes the environment so dev and staging state files never
# collide in the same S3 bucket (ADR 0012).
#
# Bootstrap workspace: infra/bootstrap/
# ---------------------------------------------------------------------------

terraform {
  backend "s3" {}
}
