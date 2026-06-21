# ---------------------------------------------------------------------------
# async module — input variables (Delivery 4, Deliverable A).
# ---------------------------------------------------------------------------

variable "queue_name_prefix" {
  description = "Prefix for SQS queue names. A '-main' and '-dlq' suffix are appended automatically (e.g. 'ticket-system-dev-async' → 'ticket-system-dev-async-main' + 'ticket-system-dev-async-dlq')."
  type        = string
}

variable "visibility_timeout_seconds" {
  description = "Seconds a received SQS message remains invisible to other consumers while being processed. Must be at least as long as the consumer's processing time to avoid duplicate delivery."
  type        = number
  default     = 60

  validation {
    condition     = var.visibility_timeout_seconds >= 0 && var.visibility_timeout_seconds <= 43200
    error_message = "visibility_timeout_seconds must be between 0 and 43200 (12 hours)."
  }
}

variable "message_retention_seconds" {
  description = "Number of seconds SQS retains a message in the main queue before deleting it. 4 days (345600 s) balances consumer downtime tolerance and cost."
  type        = number
  default     = 345600

  validation {
    condition     = var.message_retention_seconds >= 60 && var.message_retention_seconds <= 1209600
    error_message = "message_retention_seconds must be between 60 (1 min) and 1209600 (14 days)."
  }
}

variable "max_receive_count" {
  description = "Number of times a message can be received from the main queue before it is moved to the DLQ. After this many failed deliveries the consumer is considered unable to process the message."
  type        = number
  default     = 3

  validation {
    condition     = var.max_receive_count >= 1 && var.max_receive_count <= 1000
    error_message = "max_receive_count must be between 1 and 1000."
  }
}

variable "dlq_message_retention_seconds" {
  description = "Number of seconds SQS retains a dead-lettered message for inspection and replay. 14 days (1209600 s) gives operators time to diagnose failures."
  type        = number
  default     = 1209600

  validation {
    condition     = var.dlq_message_retention_seconds >= 60 && var.dlq_message_retention_seconds <= 1209600
    error_message = "dlq_message_retention_seconds must be between 60 (1 min) and 1209600 (14 days)."
  }
}
