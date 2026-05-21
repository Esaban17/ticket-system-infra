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
