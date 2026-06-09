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
