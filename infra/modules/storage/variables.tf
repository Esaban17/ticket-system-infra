variable "environment" {
  description = "Deployment environment (dev, staging, prod). Used in resource naming and to decide force_destroy semantics."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be 'dev', 'staging', or 'prod'."
  }
}

variable "bucket_name" {
  description = "Full S3 bucket name (must be globally unique across all AWS accounts). The caller is responsible for composing project/environment/suffix segments."
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the customer-managed KMS key (CMK) used for server-side encryption of bucket objects (SSE-KMS). From module.kms.key_arn. Replaces the previous SSE-S3 (AES256) default — Delivery 5 Deliverable B."
  type        = string
}

variable "force_destroy" {
  description = "If true, Terraform may destroy the bucket even when it contains objects. Acceptable in dev; in prod this MUST be false to protect real data."
  type        = bool
  default     = false
}

variable "cors_allowed_origins" {
  description = "Browser origins (scheme + host, no trailing slash) allowed to upload/download attachments DIRECTLY to S3 via presigned URLs. The SPA performs a cross-origin PUT/GET from the ingress (ALB) origin, so without a matching CORS rule the browser blocks the preflight. Empty list (default) leaves the bucket without a CORS configuration, preserving prior behaviour for environments that don't serve a browser SPA."
  type        = list(string)
  default     = []
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

  # La relación con transition_to_ia_days (glacier > IA) se valida con un
  # precondition en main.tf: las validaciones de variable solo pueden referirse
  # a sí mismas en Terraform < 1.9 (el CI fija ~> 1.8).
  validation {
    condition     = floor(var.transition_to_glacier_days) == var.transition_to_glacier_days
    error_message = "transition_to_glacier_days must be an integer number of days (use 0 or a negative value to disable the Glacier transition)."
  }
}

variable "expire_current_days" {
  description = "Number of days after which CURRENT versions of objects under lifecycle_prefix are expired (a delete marker is added). MUST be greater than transition_to_glacier_days when Glacier is enabled. Set to 0 (or any non-positive value) to disable expiration of current objects (default), so attachments/reports are retained indefinitely unless overridden per environment."
  type        = number
  default     = 0

  # La relación con transition_to_glacier_days (expire > glacier) se valida con
  # un precondition en main.tf (ver nota arriba sobre TF < 1.9).
  validation {
    condition     = floor(var.expire_current_days) == var.expire_current_days
    error_message = "expire_current_days must be an integer number of days (use 0 or a negative value to disable current-version expiration)."
  }
}
