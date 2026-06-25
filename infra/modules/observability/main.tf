# ---------------------------------------------------------------------------
# Observability module — CloudWatch logs, alarms, dashboard, SNS + budget.
#
# Delivery 5 — Deliverable E. Provides the full observability surface for the
# ticket system and is wired into the root module:
#
#   * Log groups   — dedicated, retention-bounded groups for the API and EKS
#                    cluster so logs do not accumulate forever (cost +
#                    compliance). Retention is an INPUT (shorter in dev, longer
#                    in prod) with optional per-log-group overrides.
#   * SNS alerts   — a topic that fans out CloudWatch alarm + AWS Budgets
#                    notifications, with an optional email subscription.
#   * Alarms       — Lambda Errors and SQS DLQ depth, both wired to the SNS
#                    topic via alarm_actions. All thresholds/periods are inputs.
#   * Dashboard    — request count (ALB), Lambda error rate and DLQ/RDS health.
#   * Budget       — monthly cost budget that notifies at 80% of the limit.
# ---------------------------------------------------------------------------

locals {
  common_tags = merge(
    {
      Module      = "observability"
      Environment = var.environment
    },
    var.tags,
  )

  # Each log group resolves its retention from its own override (when set) and
  # otherwise falls back to the module-wide default.
  api_retention = coalesce(var.api_log_retention_in_days, var.log_retention_in_days)
  eks_retention = coalesce(var.eks_log_retention_in_days, var.log_retention_in_days)
}

# ---- API application logs --------------------------------------------------
# Standard /aws/<workload> naming so the group is easy to find in the console
# and matches what the log forwarder is configured to write to.

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/app/${var.name_prefix}/api"
  retention_in_days = local.api_retention
  kms_key_id        = var.kms_key_arn

  tags = merge(local.common_tags, {
    Name      = "${var.name_prefix}-api-logs"
    Component = "api"
  })
}

# ---- EKS cluster logs ------------------------------------------------------
# Matches the conventional /aws/eks/<cluster>/cluster path so it can also be
# used as the destination for EKS control-plane logging when enabled.

resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${var.name_prefix}/cluster"
  retention_in_days = local.eks_retention
  kms_key_id        = var.kms_key_arn

  tags = merge(local.common_tags, {
    Name      = "${var.name_prefix}-eks-logs"
    Component = "eks"
  })
}

# ---- SNS alerts topic ------------------------------------------------------
# Single fan-out point for alarm + budget notifications. The email subscription
# is created only when alert_email is set (count == 0 otherwise) so the module
# stays usable without an email recipient.

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"

  tags = merge(local.common_tags, {
    Name      = "${var.name_prefix}-alerts"
    Component = "alerting"
  })
}

resource "aws_sns_topic_subscription" "email" {
  count = var.alert_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ---- SNS topic access policy ----------------------------------------------
# AWS Budgets validates the topic's access policy at budget-creation time: it
# must allow budgets.amazonaws.com to SNS:Publish, or `terraform apply` fails
# with "Unable to verify access for SNS topic". CloudWatch alarms also publish
# here. Both are scoped with aws:SourceAccount (and the budget with SourceArn)
# so only this account's budgets/alarms can publish (no open principal).

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_iam_policy_document" "alerts_topic" {
  statement {
    sid     = "AllowBudgetsPublish"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    resources = [aws_sns_topic.alerts.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:${data.aws_partition.current.partition}:budgets::${data.aws_caller_identity.current.account_id}:budget/*"]
    }
  }

  statement {
    sid     = "AllowCloudWatchAlarmsPublish"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    resources = [aws_sns_topic.alerts.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts_topic.json
}

# ---- CloudWatch alarms -----------------------------------------------------
# Both alarms route to the SNS topic on breach. Thresholds, period and
# evaluation_periods are all inputs (no hardcoded numbers).

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.name_prefix}-lambda-errors"
  alarm_description   = "Worker Lambda (${var.lambda_function_name}) reported invocation errors above the configured threshold."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.lambda_error_threshold
  period              = var.alarm_period_seconds
  evaluation_periods  = var.alarm_evaluation_periods
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = var.lambda_function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(local.common_tags, {
    Name      = "${var.name_prefix}-lambda-errors"
    Component = "alarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "sqs_dlq_depth" {
  alarm_name          = "${var.name_prefix}-sqs-dlq-depth"
  alarm_description   = "Dead-letter queue (${var.dlq_queue_name}) has visible messages above the configured threshold — a worker failed all retries."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.dlq_depth_threshold
  period              = var.alarm_period_seconds
  evaluation_periods  = var.alarm_evaluation_periods
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.dlq_queue_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(local.common_tags, {
    Name      = "${var.name_prefix}-sqs-dlq-depth"
    Component = "alarm"
  })
}

# ---- CloudWatch dashboard --------------------------------------------------
# Built with jsonencode() from Terraform expressions/inputs (no heredoc with
# hardcoded ARNs). Three widgets: ALB request count, Lambda error rate and
# DLQ depth + RDS connections.

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.name_prefix}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "ALB request count"
          region = var.region
          view   = "timeSeries"
          stat   = "Sum"
          period = var.alarm_period_seconds
          # When the ALB ARN suffix is known, scope to that load balancer; else
          # fall back to the account/region aggregate. Avoids an empty/null
          # dimension VALUE, which CloudWatch rejects ("only String type allowed").
          metrics = var.alb_arn_suffix != "" ? [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix],
            ] : [
            ["AWS/ApplicationELB", "RequestCount"],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Lambda error rate"
          region = var.region
          view   = "timeSeries"
          stat   = "Sum"
          period = var.alarm_period_seconds
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", var.lambda_function_name],
            ["AWS/Lambda", "Invocations", "FunctionName", var.lambda_function_name],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "DLQ depth & RDS connections"
          region = var.region
          view   = "timeSeries"
          period = var.alarm_period_seconds
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.dlq_queue_name, { stat = "Maximum" }],
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.rds_instance_identifier, { stat = "Average" }],
          ]
        }
      },
    ]
  })
}

# ---- AWS Budgets -----------------------------------------------------------
# Monthly cost budget that notifies at 80% of the configured limit via the SNS
# topic (and the alert_email when set). limit_amount is an input.

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_sns_topic_arns  = [aws_sns_topic.alerts.arn]
    subscriber_email_addresses = var.alert_email == "" ? [] : [var.alert_email]
  }
}
