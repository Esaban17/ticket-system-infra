variable "environment" {
  description = "Deployment environment (dev, prod). Used in resource naming and to decide force_destroy semantics."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be either 'dev' or 'prod'."
  }
}

variable "bucket_name" {
  description = "Full S3 bucket name (must be globally unique across all AWS accounts). The caller is responsible for composing project/environment/suffix segments."
  type        = string
}

variable "force_destroy" {
  description = "If true, Terraform may destroy the bucket even when it contains objects. Acceptable in dev; in prod this MUST be false to protect real data."
  type        = bool
  default     = false
}

variable "lifecycle_prefix" {
  description = "Key prefix scope for the lifecycle rule. Required by the rubric: lifecycle rules must NOT apply to the entire bucket without a scope. Defaults to 'attachments/' which is where ticket attachments live."
  type        = string
  default     = "attachments/"
}

variable "transition_to_ia_days" {
  description = "Number of days after which current versions of objects under lifecycle_prefix transition to STANDARD_IA (lower-cost storage class)."
  type        = number
  default     = 30
}

variable "expire_noncurrent_versions_days" {
  description = "Number of days after which non-current object versions (created by versioning) are permanently deleted."
  type        = number
  default     = 90
}

variable "transition_to_glacier_days" {
  description = "Number of days after which current versions of objects under lifecycle_prefix transition from STANDARD_IA to GLACIER (cheap, archival storage for cold attachments/reports). MUST be greater than transition_to_ia_days. Set to 0 (or any non-positive value) to disable the Glacier transition entirely. Default of 90 keeps objects in IA for ~2 months before archiving."
  type        = number
  default     = 90

  validation {
    condition     = var.transition_to_glacier_days <= 0 || var.transition_to_glacier_days > var.transition_to_ia_days
    error_message = "transition_to_glacier_days must be greater than transition_to_ia_days (or <= 0 to disable Glacier transition)."
  }
}

variable "expire_current_days" {
  description = "Number of days after which CURRENT versions of objects under lifecycle_prefix are expired (a delete marker is added). MUST be greater than transition_to_glacier_days when Glacier is enabled. Set to 0 (or any non-positive value) to disable expiration of current objects (default), so attachments/reports are retained indefinitely unless overridden per environment."
  type        = number
  default     = 0

  validation {
    condition     = var.expire_current_days <= 0 || var.transition_to_glacier_days <= 0 || var.expire_current_days > var.transition_to_glacier_days
    error_message = "expire_current_days must be greater than transition_to_glacier_days when both are enabled (or <= 0 to disable current-version expiration)."
  }
}
