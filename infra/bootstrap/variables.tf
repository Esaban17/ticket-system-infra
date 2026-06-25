variable "region" {
  description = "AWS region for the state bucket and lock table. Must match the region used by the main workspace backend block."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Globally-unique S3 bucket name that will store the Terraform state of the main workspace. Must include a team-specific suffix to avoid collisions."
  type        = string
  default     = "ticket-system-tfstate-galileo-pdds"
}

variable "lock_table_name" {
  description = "DynamoDB table name used by Terraform to acquire distributed locks during plan/apply. The hash key must be exactly 'LockID'."
  type        = string
  default     = "ticket-system-tflock"
}

# ---- CI runner role (GitHub Actions OIDC) ----------------------------------

variable "name_prefix" {
  description = "Prefix for the CI runner role name (e.g. 'ticket-system-dev'). The resulting role name must match the CI_RUNNER_ROLE_ARN repo variable consumed by the workflows."
  type        = string
  default     = "ticket-system-dev"
}

variable "github_org" {
  description = "GitHub org/owner allowed to assume the CI runner role via OIDC. MUST be the repo's CURRENT owner as it appears in the OIDC token sub claim (the 'gitcombo' remote is a redirect to the renamed owner 'Esaban17')."
  type        = string
  default     = "Esaban17"
}

variable "github_repo" {
  description = "GitHub repository name allowed to assume the CI runner role via OIDC."
  type        = string
  default     = "ticket-system-infra"
}

variable "github_branch_ref" {
  description = "Git ref the CI runner OIDC trust is locked to (repo:<org>/<repo>:ref:<branch_ref>)."
  type        = string
  default     = "refs/heads/main"
}

variable "github_environments" {
  description = "GitHub Actions Environments whose jobs may assume the CI runner role (they present sub = repo:<org>/<repo>:environment:<env> instead of the branch ref)."
  type        = list(string)
  default     = ["dev", "staging"]
}
