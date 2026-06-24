output "api_log_group_name" {
  description = "Name of the API application CloudWatch log group. Configure the log forwarder (Fluent Bit) and IAM policies to write to this group."
  value       = aws_cloudwatch_log_group.api.name
}

output "api_log_group_arn" {
  description = "ARN of the API application log group. Referenced by IAM policies that grant logs:PutLogEvents to the API workload."
  value       = aws_cloudwatch_log_group.api.arn
}

output "eks_log_group_name" {
  description = "Name of the EKS cluster CloudWatch log group. Can be used as the destination for EKS control-plane logging."
  value       = aws_cloudwatch_log_group.eks.name
}

output "eks_log_group_arn" {
  description = "ARN of the EKS cluster log group."
  value       = aws_cloudwatch_log_group.eks.arn
}

output "log_group_names" {
  description = "Map of logical component name to log group name for all groups created by this module. Convenient for wiring multiple consumers at once."
  value = {
    api = aws_cloudwatch_log_group.api.name
    eks = aws_cloudwatch_log_group.eks.name
  }
}

output "log_group_arns" {
  description = "Map of logical component name to log group ARN for all groups created by this module. Referenced by IAM policies that grant logs:PutLogEvents to the workloads."
  value = {
    api = aws_cloudwatch_log_group.api.arn
    eks = aws_cloudwatch_log_group.eks.arn
  }
}

output "sns_topic_arn" {
  description = "ARN of the SNS alerts topic that fans out CloudWatch alarm and AWS Budgets notifications. Subscribe additional endpoints (PagerDuty, Slack relay) to this topic."
  value       = aws_sns_topic.alerts.arn
}

output "alarm_arns" {
  description = "Map of logical alarm name to CloudWatch metric alarm ARN created by this module (lambda-errors, sqs-dlq-depth). Useful for evidence capture and for composite alarms."
  value = {
    lambda-errors = aws_cloudwatch_metric_alarm.lambda_errors.arn
    sqs-dlq-depth = aws_cloudwatch_metric_alarm.sqs_dlq_depth.arn
  }
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard. Open it with the AWS console URL .../cloudwatch/home#dashboards:name=<this>."
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "budget_id" {
  description = "ID of the monthly AWS Budgets cost budget that notifies at 80% of the configured limit."
  value       = aws_budgets_budget.monthly.id
}
