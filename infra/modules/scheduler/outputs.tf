# ---------------------------------------------------------------------------
# scheduler module — outputs.
# ---------------------------------------------------------------------------

output "schedule_arn" {
  description = "ARN of the EventBridge Scheduler schedule. Used in evidence capture and referenced in the delivery summary."
  value       = aws_scheduler_schedule.this.arn
}

output "scheduler_role_arn" {
  description = "ARN of the dedicated IAM role used by EventBridge Scheduler to invoke the target Lambda (created in ./modules/iam, injected via var.scheduler_role_arn). Scoped to lambda:InvokeFunction on the specific target ARN only."
  value       = var.scheduler_role_arn
}
