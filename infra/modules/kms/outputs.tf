# ---------------------------------------------------------------------------
# KMS module — outputs.
# ---------------------------------------------------------------------------

output "key_arn" {
  description = "ARN of the CMK. Passed to the storage, database, secrets and IAM modules so encryption and least-privilege kms:Decrypt are scoped to THIS key (no wildcards)."
  value       = aws_kms_key.main.arn
}

output "key_id" {
  description = "Key ID of the CMK (the UUID portion of the ARN). Used where a key id (not ARN) is expected, e.g. aws_s3_bucket_server_side_encryption_configuration.kms_master_key_id."
  value       = aws_kms_key.main.key_id
}

output "alias_arn" {
  description = "ARN of the CMK alias (alias/<name_prefix>-cmk). Human-friendly stable identifier for the key."
  value       = aws_kms_alias.main.arn
}
