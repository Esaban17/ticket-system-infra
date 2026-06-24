# ---------------------------------------------------------------------------
# scheduler module — EventBridge Scheduler + dedicated IAM role (Delivery 4,
# Deliverable C).
#
# Design decisions (see ADR 0013):
#   - Dedicated scheduler IAM role: the trust policy allows only the
#     EventBridge Scheduler service to assume it; the inline policy grants
#     ONLY lambda:InvokeFunction on the SPECIFIC target Lambda ARN. This is
#     intentionally narrower than the Lambda's own execution role.
#   - flexible_time_window = OFF: the schedule fires at exactly the configured
#     time with no jitter window (appropriate for a daily report generator).
# ---------------------------------------------------------------------------

# ---- Scheduler IAM role (centralized in ./modules/iam) -----------------------
# The dedicated EventBridge Scheduler role (trust = scheduler.amazonaws.com,
# inline policy = lambda:InvokeFunction on the target ARN only) was CENTRALIZED
# into ./modules/iam (Delivery 5, Deliverable A). Its ARN is injected via
# var.scheduler_role_arn. No IAM resources are created in this module anymore.

# ---- EventBridge Scheduler ---------------------------------------------------

resource "aws_scheduler_schedule" "this" {
  name                         = var.name
  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.scheduler_timezone

  # No jitter: fire exactly at the scheduled time.
  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.target_lambda_arn
    role_arn = var.scheduler_role_arn
  }
}
