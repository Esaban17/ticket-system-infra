# ---------------------------------------------------------------------------
# scheduler module — input variables (Delivery 4, Deliverable C).
# ---------------------------------------------------------------------------

variable "name" {
  description = "Name for the EventBridge Scheduler schedule and its dedicated IAM role. Should be unique within the AWS account and region."
  type        = string
}

variable "schedule_expression" {
  description = "Rate or cron expression that controls when the schedule fires. Use 'rate(N unit)' for intervals (e.g. 'rate(1 day)') or 'cron(min hour day month weekday year)' for specific times."
  type        = string
}

variable "target_lambda_arn" {
  description = "ARN of the Lambda function to invoke on each schedule firing. The scheduler IAM role is scoped to THIS specific ARN — no wildcard resource. This is narrower than the Lambda's own execution role (ADR 0013)."
  type        = string
}

variable "scheduler_timezone" {
  description = "IANA timezone for interpreting the schedule expression (e.g. 'America/Guatemala', 'UTC'). Only relevant for cron expressions; rate() expressions are timezone-independent."
  type        = string
  default     = "UTC"
}
