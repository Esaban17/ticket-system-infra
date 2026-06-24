# ---------------------------------------------------------------------------
# Centralized IAM module — input variables (Delivery 5, Deliverable A).
# ---------------------------------------------------------------------------

variable "name_prefix" {
  description = "Project-level prefix (e.g. 'ticket-system-dev') applied to every IAM role/policy name created here. Also drives the prefix-scoped IAM resource ARNs in the CI runner policy (role/<name_prefix>-*, policy/<name_prefix>-*)."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod). Used for tagging/context; resource names already carry it via name_prefix."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be 'dev', 'staging', or 'prod'."
  }
}

variable "function_name" {
  description = "Name of the Lambda function whose execution role is managed here. Used to compose the CloudWatch log group ARN (/aws/lambda/<function_name>:*) and the scheduler's target Lambda ARN (function:<function_name>) by name, so this module does not depend on the compute module (breaks the iam<->compute cycle)."
  type        = string
}

variable "bucket_arn" {
  description = "ARN of the S3 attachments bucket. Scopes the Lambda execution role's S3 policy and the app/consumer IRSA policies to THIS bucket only — no wildcard resource."
  type        = string
}

variable "sqs_queue_arn" {
  description = "ARN of the main SQS queue. Scopes the consumer policy (Receive/Delete/GetQueueAttributes) and adds sqs:SendMessage to the app (producer) policy. Leave empty ('') to omit the SQS SendMessage statement on the app policy (backward-compatible)."
  type        = string
  default     = ""
}

variable "target_lambda_arn" {
  description = "ARN of the Lambda the EventBridge Scheduler invokes. Leave empty ('') to let the module compose the ARN by name from function_name (the default, which avoids a dependency cycle with the compute module). Supply an explicit ARN only if it cannot be composed by name."
  type        = string
  default     = ""
}

variable "github_org" {
  description = "GitHub organization/owner that owns the repository allowed to assume the CI runner role via OIDC. Used in the trust policy sub condition (repo:<org>/<repo>:ref:<branch_ref>). MUST be the repo's CURRENT owner as it appears in the GitHub Actions OIDC token sub claim — the 'gitcombo' remote URL is a redirect to the renamed owner 'Esaban17', and OIDC emits the current name."
  type        = string
  default     = "Esaban17"
}

variable "github_repo" {
  description = "GitHub repository name allowed to assume the CI runner role via OIDC. Used in the trust policy sub condition."
  type        = string
  default     = "ticket-system-infra"
}

variable "github_branch_ref" {
  description = "Git ref (e.g. 'refs/heads/main') the CI runner OIDC trust is locked to. Combined as repo:<org>/<repo>:ref:<branch_ref> in the StringEquals sub condition so only that branch can assume the role."
  type        = string
  default     = "refs/heads/main"
}

variable "tags" {
  description = "Tags applied to the IAM roles, policies and the OIDC provider created by this module."
  type        = map(string)
  default     = {}
}
