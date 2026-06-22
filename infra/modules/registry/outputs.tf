output "ecr_repository_url" {
  description = "Full URL of the ECR repository (e.g. 123456789012.dkr.ecr.us-east-1.amazonaws.com/ticket-system-api). Required by BL-101 to be consumable from the root module; consumed by BL-102 (docker push) and by future ECS/EKS task definitions."
  value       = var.create_repository ? aws_ecr_repository.this[0].repository_url : data.aws_ecr_repository.existing[0].repository_url
}

output "ecr_repository_arn" {
  description = "ARN of the ECR repository. Referenced by IAM policies that grant pull/push permissions to CI roles and to the compute task execution role."
  value       = var.create_repository ? aws_ecr_repository.this[0].arn : data.aws_ecr_repository.existing[0].arn
}

output "ecr_repository_name" {
  description = "Bare name of the ECR repository (without registry prefix). Useful for AWS CLI calls such as `aws ecr describe-repositories --repository-names`."
  value       = var.create_repository ? aws_ecr_repository.this[0].name : data.aws_ecr_repository.existing[0].name
}
