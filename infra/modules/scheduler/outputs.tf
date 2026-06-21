# ---------------------------------------------------------------------------
# scheduler module — outputs.
# ---------------------------------------------------------------------------

output "schedule_arn" {
  description = "ARN of the EventBridge Scheduler schedule. Used in evidence capture and referenced in the delivery summary."
  value       = aws_scheduler_schedule.this.arn
}

output "scheduler_role_arn" {
  description = "ARN of the dedicated IAM role used by EventBridge Scheduler to invoke the target Lambda. Scoped to lambda:InvokeFunction on the specific target ARN only (ADR 0013)."
  value       = aws_iam_role.scheduler.arn
}
