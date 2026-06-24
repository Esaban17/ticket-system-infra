# ---------------------------------------------------------------------------
# Secrets module — outputs.
# ---------------------------------------------------------------------------

output "secret_arn" {
  description = "ARN of the Secrets Manager secret holding the DB credentials. Passed to the IAM policies (scoped secretsmanager:GetSecretValue) and to the app/consumer/seed ConfigMap (SECRET_ARN) so the runtime can fetch it."
  value       = aws_secretsmanager_secret.db.arn
}

output "secret_name" {
  description = "Name of the Secrets Manager secret ('<name_prefix>-db')."
  value       = aws_secretsmanager_secret.db.name
}

output "password" {
  description = "The effective DB master password (caller-provided or generated). Consumed by the database module so RDS is created with the same password stored in the secret. Marked sensitive — never printed in plan output."
  value       = local.db_password
  sensitive   = true
}
