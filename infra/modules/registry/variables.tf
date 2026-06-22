variable "env" {
  description = "Deployment environment (dev, staging, prod). Surfaced as a resource tag and available for naming decisions inside the module."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.env)
    error_message = "env must be 'dev', 'staging', or 'prod'."
  }
}

variable "name_prefix" {
  description = "Prefix applied to ECR-related resource names. The repository itself is named 'ticket-system-api' per BL-101; name_prefix is reserved for any auxiliary resources (e.g. future replication configs) and to keep this module symmetrical with the rest of the codebase."
  type        = string
  default     = "ticket-system"
}

variable "repository_name" {
  description = "Name of the ECR repository. BL-101 mandates 'ticket-system-api'; exposed as a variable so the module remains reusable for a future second image (e.g. worker) without copy-paste."
  type        = string
  default     = "ticket-system-api"
}

variable "create_repository" {
  description = "When true (default), create and manage the ECR repository as a Terraform resource. Set to false in staging so the module reads the repository created by dev via a data source instead of trying to create a duplicate (ECR repository names are account-scoped, not environment-scoped)."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags merged on top of the provider's default_tags. Use this for tags specific to the registry (e.g. cost-center splits) without touching the global provider config."
  type        = map(string)
  default     = {}
}

variable "max_tagged_images" {
  description = "Number of most recent tagged images to retain. Older tagged images are expired by the lifecycle policy to cap storage cost. BL-101 specifies 10."
  type        = number
  default     = 10

  validation {
    condition     = var.max_tagged_images > 0
    error_message = "max_tagged_images must be greater than 0."
  }
}

variable "untagged_expiry_days" {
  description = "Days after which untagged images are expired. Untagged images are usually orphaned builds; BL-101 specifies 7 days."
  type        = number
  default     = 7

  validation {
    condition     = var.untagged_expiry_days > 0
    error_message = "untagged_expiry_days must be greater than 0."
  }
}
