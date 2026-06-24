# ---------------------------------------------------------------------------
# KMS module — input variables.
# ---------------------------------------------------------------------------

variable "name_prefix" {
  description = "Prefix applied to the CMK alias and used in the key description (e.g. 'ticket-system-dev'). The alias becomes 'alias/<name_prefix>-cmk'."
  type        = string
}

variable "deletion_window_in_days" {
  description = "Number of days AWS waits before permanently deleting the CMK after ScheduleKeyDeletion. 7 (minimum) in dev for fast teardown; raise in prod."
  type        = number
  default     = 7

  validation {
    condition     = var.deletion_window_in_days >= 7 && var.deletion_window_in_days <= 30
    error_message = "deletion_window_in_days must be between 7 and 30."
  }
}

variable "allowed_role_arns" {
  description = "IAM role ARNs granted data-plane access (kms:Decrypt/GenerateDataKey/DescribeKey) in the key policy. These are the runtime execution roles (Lambda exec role + app IRSA role) composed BY NAME at the root via data.aws_caller_identity — NOT references to the IAM module — so the kms -> iam dependency stays one-directional and no cycle forms. Empty list (default) omits the data-plane statement entirely."
  type        = list(string)
  default     = []
}
