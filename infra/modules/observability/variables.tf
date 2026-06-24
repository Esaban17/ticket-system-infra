variable "name_prefix" {
  description = "Prefix applied to every log group name (e.g., 'ticket-system-dev'). Keeps log groups grouped and discoverable per project/environment. Used together with the per-log-group suffixes below."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod). Propagated as a tag and used to drive sensible per-env retention defaults from the caller."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be 'dev', 'staging', or 'prod'."
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

# ---- Alerting (SNS) --------------------------------------------------------

variable "alert_email" {
  description = "Email address subscribed to the SNS alerts topic that receives CloudWatch alarm notifications and (optionally) budget notifications. When empty (the default) no email subscription is created and the topic only carries the budget/SNS wiring. AWS sends a one-time confirmation email that must be accepted before notifications flow."
  type        = string
  default     = ""
}

# ---- CloudWatch alarms -----------------------------------------------------

variable "lambda_function_name" {
  description = "Name of the worker Lambda whose Errors metric drives the 'lambda-errors' alarm. Used as the FunctionName dimension in the AWS/Lambda namespace. Comes from the caller (local.worker_function_name) so the alarm tracks the exact function deployed."
  type        = string
}

variable "dlq_queue_name" {
  description = "Name of the SQS dead-letter queue whose ApproximateNumberOfMessagesVisible metric drives the 'sqs-dlq-depth' alarm. Used as the QueueName dimension in the AWS/SQS namespace. Any visible message in the DLQ means a worker failed all retries."
  type        = string
}

variable "lambda_error_threshold" {
  description = "Threshold (count of Lambda invocation errors over the evaluation window) above which the 'lambda-errors' alarm fires. 1 means alarm on any error in the period."
  type        = number
  default     = 1
}

variable "dlq_depth_threshold" {
  description = "Threshold (number of visible messages in the DLQ) above which the 'sqs-dlq-depth' alarm fires. 1 means alarm as soon as a single message is dead-lettered."
  type        = number
  default     = 1
}

variable "alarm_period_seconds" {
  description = "Length (in seconds) of each metric aggregation period for the CloudWatch alarms. 300 (5 minutes) is the default CloudWatch granularity for these metrics."
  type        = number
  default     = 300
}

variable "alarm_evaluation_periods" {
  description = "Number of consecutive periods the metric must breach the threshold before the alarm transitions to ALARM. 1 reacts as fast as possible."
  type        = number
  default     = 1
}

# ---- Dashboard inputs ------------------------------------------------------

variable "region" {
  description = "AWS region used by the CloudWatch dashboard widgets to scope the metrics. Defaults to the provider region when unset by the caller."
  type        = string
  default     = "us-east-1"
}

variable "alb_arn_suffix" {
  description = "ARN suffix (LoadBalancer dimension value, e.g. 'app/<name>/<id>') of the ingress ALB used by the dashboard request-count widget (AWS/ApplicationELB RequestCount). When empty the widget renders without a series rather than referencing a hardcoded ALB."
  type        = string
  default     = ""
}

variable "rds_instance_identifier" {
  description = "RDS DBInstanceIdentifier used by the dashboard DatabaseConnections widget (AWS/RDS). When empty the widget renders without a series rather than referencing a hardcoded instance."
  type        = string
  default     = ""
}

# ---- Budget ----------------------------------------------------------------

variable "monthly_budget_usd" {
  description = "Monthly cost budget (USD) for the project. AWS Budgets sends a notification when ACTUAL spend exceeds 80% of this amount, routed to the SNS alerts topic (and the alert_email if set)."
  type        = number
  default     = 50
}
