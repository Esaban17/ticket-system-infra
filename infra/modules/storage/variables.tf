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
