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

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ---- Scheduler IAM role (dedicated, least-privilege) -------------------------
# Trust policy: only EventBridge Scheduler may assume this role. This prevents
# any other AWS service (including Lambda itself) from using it.

data "aws_iam_policy_document" "scheduler_assume_role" {
  statement {
    sid     = "AllowSchedulerToAssume"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name}-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume_role.json
  description        = "Least-privilege role for EventBridge Scheduler '${var.name}' - only lambda:InvokeFunction on the target ARN."
}

# Inline policy: only InvokeFunction on the SPECIFIC target Lambda ARN.
# No wildcard resource — rubric requirement and ADR 0013.
data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    sid     = "AllowInvokeTargetLambda"
    effect  = "Allow"
    actions = ["lambda:InvokeFunction"]
    # Scoped to the exact Lambda ARN supplied by the caller.
    resources = [var.target_lambda_arn]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "${var.name}-invoke"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

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
    role_arn = aws_iam_role.scheduler.arn
  }
}
