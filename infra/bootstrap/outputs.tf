output "state_bucket_name" {
  description = "Name of the S3 bucket that backs the remote state. Copy this into infra/backend.tf — backend blocks cannot reference variables, so the value must be hardcoded there."
  value       = aws_s3_bucket.state.bucket
}

output "lock_table_name" {
  description = "Name of the DynamoDB table used by Terraform to lock concurrent operations. Copy into infra/backend.tf."
  value       = aws_dynamodb_table.lock.name
}

output "region" {
  description = "AWS region of the state backend. Copy into infra/backend.tf."
  value       = var.region
}

output "ci_runner_role_arn" {
  description = "ARN of the GitHub Actions OIDC CI runner role. Set this as the CI_RUNNER_ROLE_ARN GitHub Actions repo variable consumed by the apply/destroy/deploy workflows."
  value       = aws_iam_role.ci_runner.arn
}

output "github_oidc_provider_arn" {
  description = "ARN of the account-global GitHub Actions OIDC identity provider (referenced, not owned)."
  value       = data.aws_iam_openid_connect_provider.github.arn
}
