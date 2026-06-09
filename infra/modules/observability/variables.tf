variable "name_prefix" {
  description = "Prefix applied to every log group name (e.g., 'ticket-system-dev'). Keeps log groups grouped and discoverable per project/environment. Used together with the per-log-group suffixes below."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, prod). Propagated as a tag and used to drive sensible per-env retention defaults from the caller."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be either 'dev' or 'prod'."
  }
}

variable "log_retention_in_days" {
  description = "Default retention (in days) applied to every log group that does not set its own override. Driven per env by the caller (e.g., 14 in dev, 90 in prod). Must be one of the values CloudWatch Logs accepts; 0 means 'never expire'."
  type        = number
  default     = 30

  validation {
    condition = contains(
      [0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653],
      var.log_retention_in_days
    )
    error_message = "log_retention_in_days must be a value accepted by CloudWatch Logs (0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288 or 3653)."
  }
}

variable "api_log_retention_in_days" {
  description = "Optional per-log-group override for the NestJS API application log group. When null, falls back to log_retention_in_days. Lets prod keep API logs longer than the cluster baseline if required for auditing."
  type        = number
  default     = null
}

variable "eks_log_retention_in_days" {
  description = "Optional per-log-group override for the EKS cluster log group. When null, falls back to log_retention_in_days."
  type        = number
  default     = null
}

variable "kms_key_arn" {
  description = "Optional KMS key ARN used to encrypt the log groups at rest. When null, CloudWatch Logs uses the default service-managed encryption. Recommended to set in prod for customer-managed encryption."
  type        = string
  default     = null
}

variable "tags" {
  description = "Extra tags merged into every resource created by this module."
  type        = map(string)
  default     = {}
}
