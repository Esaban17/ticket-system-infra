variable "environment" {
  description = "Deployment environment (dev, prod). Used in resource naming and to size memory/timeout if needed."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be either 'dev' or 'prod'."
  }
}

variable "name" {
  description = "Logical name of the Lambda function (a project-level prefix is added by the caller). Example: 'worker' becomes 'ticket-system-dev-worker'."
  type        = string
  default     = "worker"
}

variable "project_name" {
  description = "Project-level prefix applied to all resource names so they don't collide with other teams in the same AWS account."
  type        = string
  default     = "ticket-system"
}

variable "memory_size" {
  description = "Memory allocated to the Lambda function in MB. AWS bills proportional to memory * duration, so 128 MB is the cheapest tier for an async worker placeholder."
  type        = number
  default     = 128

  validation {
    condition     = var.memory_size >= 128 && var.memory_size <= 10240
    error_message = "memory_size must be between 128 and 10240 MB."
  }
}

variable "timeout_seconds" {
  description = "Maximum execution time of a single Lambda invocation in seconds. 30s is enough for the worker placeholder; raise for SQS batches of slow downstream calls."
  type        = number
  default     = 30
}

variable "runtime" {
  description = "Lambda runtime identifier (e.g., python3.12, nodejs20.x). The packaged source under lambda-src/ must match."
  type        = string
  default     = "python3.12"
}

variable "vpc_id" {
  description = "VPC where the Lambda's ENIs will live. Lambda must be inside a VPC so its Security Group can be referenced from the RDS module as the ingress source."
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs where the Lambda's ENIs are created. Should be private subnets in production; default VPC subnets are acceptable as a placeholder."
  type        = list(string)
}

variable "log_retention_days" {
  description = "Number of days CloudWatch keeps log events from this function. 14 days is a balance between debugging and cost."
  type        = number
  default     = 14
}
