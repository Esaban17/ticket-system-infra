output "instance_arn" {
  description = "ARN of the RDS instance. Required by the Delivery 2 rubric (module must expose the resource ARN)."
  value       = aws_db_instance.this.arn
}

output "endpoint" {
  description = "Connection endpoint of the RDS instance in 'host:port' format. Consumed by the application via environment variables (set in Delivery 4)."
  value       = aws_db_instance.this.endpoint
}

output "port" {
  description = "Port the database listens on (5432 for Postgres). Useful when generating connection strings programmatically."
  value       = aws_db_instance.this.port
}

output "db_security_group_id" {
  description = "ID of the Security Group attached to the RDS instance. Exposed for reference; the only ingress rule is sourced from the application SG passed in via app_security_group_id."
  value       = aws_security_group.db.id
}

output "db_name" {
  description = "Name of the initial database. Used as part of connection strings."
  value       = aws_db_instance.this.db_name
}
