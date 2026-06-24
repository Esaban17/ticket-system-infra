# ---------------------------------------------------------------------------
# Secrets module — input variables.
# ---------------------------------------------------------------------------

variable "name_prefix" {
  description = "Prefix for the secret name (e.g. 'ticket-system-dev'). The secret is named '<name_prefix>-db'."
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the CMK used to encrypt the secret (from module.kms.key_arn). The secret material is encrypted with this customer-managed key instead of the AWS-managed aws/secretsmanager key."
  type        = string
}

variable "username" {
  description = "Database master username stored in the secret. Not a secret on its own (visible via the RDS API) but kept together with the password so the API reads one secret. Matches var.db_username at the root."
  type        = string
}

variable "db_password" {
  description = "Optional explicit master password. When null (default) the module generates a strong random password (random_password.db). Provide a non-null value only to adopt an existing/external password. Marked sensitive."
  type        = string
  default     = null
  sensitive   = true
}

variable "recovery_window_in_days" {
  description = "Days Secrets Manager retains the secret after deletion before permanent removal. 0 in dev so `terraform destroy` deletes immediately (otherwise the name stays reserved and re-create fails). Set 7-30 in prod."
  type        = number
  default     = 0

  validation {
    condition     = var.recovery_window_in_days == 0 || (var.recovery_window_in_days >= 7 && var.recovery_window_in_days <= 30)
    error_message = "recovery_window_in_days must be 0 (immediate deletion) or between 7 and 30."
  }
}
