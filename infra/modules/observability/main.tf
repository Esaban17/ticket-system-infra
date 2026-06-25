# ---------------------------------------------------------------------------
# Observability module — CloudWatch log groups for the ticket system.
#
# Provisions dedicated, retention-bounded log groups for the main workloads so
# logs do not accumulate forever (cost + compliance):
#
#   * API app logs   — application logs emitted by the NestJS 10 API (app/api)
#                      running on EKS, shipped via Fluent Bit / the container
#                      stdout collector.
#   * EKS cluster    — control-plane / cluster-level logs.
#
# Retention is an INPUT driven per environment (e.g., shorter in dev, longer in
# prod) via log_retention_in_days, with optional per-log-group overrides.
#
# NOTE: this module is intentionally NOT wired into the root module. It is a
# ready-to-consume building block; the root can adopt it without any change to
# this code.
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

# ---------------------------------------------------------------------------
# Alerting — SNS topic + CloudWatch alarms (Delivery 5, §11).
#
# A single SNS topic ("<prefix>-alerts") is the fan-out point for operational
# alerts. Two producers publish to it:
#   1. CloudWatch alarms (defined below) — infra-level signals.
#   2. The async consumer (app-level) — publishes when a message is about to
#      land in the DLQ (sns:Publish via its IRSA role).
#
# The topic is intentionally NOT KMS-encrypted: email subscriptions to an
# encrypted topic require a customer-managed key whose policy grants SNS the
# CMK, which is out of scope here; alert payloads carry no secrets.
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"

  tags = merge(local.common_tags, {
    Name      = "${var.name_prefix}-alerts"
    Component = "alerts"
  })
}

# Email subscription (operations inbox). Only created when an address is given.
# AWS sends a confirmation email; the subscription stays "pending" until the
# recipient clicks the link (expected, surfaced as SubscriptionsPending).
resource "aws_sns_topic_subscription" "alerts_email" {
  count     = var.alerts_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alerts_email
}

# ---- Alarm 1: DLQ not empty -------------------------------------------------
# Any message in the dead-letter queue means a message failed processing after
# maxReceiveCount attempts — a real incident worth paging on.
resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  count = var.enable_alarms && var.dlq_queue_name != "" ? 1 : 0

  alarm_name          = "${var.name_prefix}-dlq-not-empty"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = var.dlq_queue_name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_description   = "Hay mensajes en la DLQ async: un mensaje no pudo procesarse tras los reintentos."
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

# ---- Alarm 2: consumer backlog (oldest message age) -------------------------
# A growing age of the oldest message in the main queue signals the consumer is
# down or not keeping up (KEDA stuck at 0, crashloop, etc.).
resource "aws_cloudwatch_metric_alarm" "queue_backlog_age" {
  count = var.enable_alarms && var.main_queue_name != "" ? 1 : 0

  alarm_name          = "${var.name_prefix}-async-backlog-age"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  dimensions          = { QueueName = var.main_queue_name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = var.queue_age_alarm_seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_description   = "El mensaje más antiguo de la cola async supera el umbral: el consumer puede estar caído o saturado."
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

# ---- Alarm 3: Lambda errors -------------------------------------------------
# Errors in the report-generator Lambda (invoked daily by EventBridge Scheduler).
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  count = var.enable_alarms && var.lambda_function_name != "" ? 1 : 0

  alarm_name          = "${var.name_prefix}-lambda-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = var.lambda_function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_description   = "El Lambda report-generator registró errores en la última ventana."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}
