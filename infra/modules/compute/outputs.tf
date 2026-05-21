output "function_arn" {
  description = "ARN of the Lambda function. Required by the Delivery 2 rubric (compute module must expose at least one output exposing the resource ARN)."
  value       = aws_lambda_function.this.arn
}

output "function_name" {
  description = "Name of the Lambda function. Used by the evidence command (`aws lambda get-function --function-name ...`) and by downstream modules wiring event source mappings."
  value       = aws_lambda_function.this.function_name
}

output "role_arn" {
  description = "ARN of the IAM execution role attached to the Lambda. Useful when granting the function access to additional resources (e.g., S3 bucket, SQS queue)."
  value       = aws_iam_role.lambda_exec.arn
}

output "security_group_id" {
  description = "ID of the Security Group attached to the Lambda's ENIs. Referenced by the database module to allow ingress on port 5432 ONLY from this SG."
  value       = aws_security_group.lambda.id
}

output "log_group_name" {
  description = "Name of the CloudWatch log group associated with the function."
  value       = aws_cloudwatch_log_group.lambda.name
}
