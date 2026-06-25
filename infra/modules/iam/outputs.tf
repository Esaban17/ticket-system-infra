# ---------------------------------------------------------------------------
# Centralized IAM module — outputs (Delivery 5, Deliverable A).
# Every ARN is consumed by a functional module (compute/scheduler/ingress) or
# re-exposed at the root for Deliverable C (CI runner / OIDC).
# ---------------------------------------------------------------------------

output "lambda_exec_role_arn" {
  description = "ARN of the Lambda execution role. Consumed by the compute module as aws_lambda_function.role."
  value       = aws_iam_role.lambda_exec.arn
}

output "scheduler_role_arn" {
  description = "ARN of the EventBridge Scheduler role (lambda:InvokeFunction on the report-generator Lambda only). Consumed by the scheduler module as the target role_arn."
  value       = aws_iam_role.scheduler.arn
}

output "app_policy_arn" {
  description = "ARN of the app (producer/API) IAM policy (S3 + scoped SQS SendMessage). Consumed by the ingress module's app IRSA role_policy_arns."
  value       = aws_iam_policy.app_s3.arn
}

output "consumer_policy_arn" {
  description = "ARN of the consumer IAM policy (scoped SQS poll + S3 PutObject). Consumed by the ingress module's consumer IRSA role_policy_arns."
  value       = aws_iam_policy.consumer.arn
}
