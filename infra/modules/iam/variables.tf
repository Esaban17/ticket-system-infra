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

# ---- Secrets Manager + KMS (Delivery 5 — Deliverable B) ---------------------
# Scope the runtime data-plane grants to the EXACT secret + key ARNs (no
# wildcards). When set: the app (IRSA) policy gets secretsmanager:GetSecretValue
# + kms:Decrypt/DescribeKey, and the Lambda execution role gets
# secretsmanager:GetSecretValue + kms:Decrypt/GenerateDataKey (the bucket is now
# SSE-KMS so PutObject must wrap a data key). Empty ('') omits the statements.

variable "secret_arn" {
  description = "ARN of the Secrets Manager secret with the DB credentials (from module.secrets.secret_arn). When set, the app IRSA policy and the Lambda execution role get secretsmanager:GetSecretValue scoped to THIS exact ARN (no wildcard). Empty ('') omits the statement."
  type        = string
  default     = ""
}

variable "kms_key_arn" {
  description = "ARN of the CMK (from module.kms.key_arn). When set, the app IRSA policy gets kms:Decrypt+DescribeKey and the Lambda execution role gets kms:Decrypt+GenerateDataKey, scoped to THIS exact key (no wildcard): Decrypt to unwrap the secret, GenerateDataKey because the attachments bucket now uses SSE-KMS and the Lambda's s3:PutObject must wrap object data keys. Empty ('') omits the statements."
  type        = string
  default     = ""
}

variable "ses_identity_arn" {
  description = "ARN de la identidad de email de SES (de module.ses.identity_arn). Cuando está seteado, las políticas IRSA del app y del consumer reciben ses:SendEmail + ses:SendRawEmail scoped a ESTA identidad (sin wildcards) para enviar los correos de notificación de tickets (EP-12 / BL-119). Vacío ('') omite el statement (backward-compatible)."
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
