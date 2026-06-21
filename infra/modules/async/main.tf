# ---------------------------------------------------------------------------
# async module — SQS main queue + dead-letter queue (Delivery 4, Deliverable A).
#
# Architecture:
#   Producer (NestJS API, IRSA: sqs:SendMessage) → main queue
#       → consumer Deployment (EKS, IRSA: sqs:ReceiveMessage/DeleteMessage)
#       → DLQ (messages that failed maxReceiveCount delivery attempts)
#
# Design decisions (see ADR 0010):
#   - SQS Standard (not FIFO): notifications do not require strict ordering and
#     standard queues offer higher throughput + lower cost.
#   - DLQ via redrive_policy: failed messages are preserved for inspection and
#     replay rather than silently dropped.
#   - No resource wildcards in any downstream IAM policy (rubric requirement).
#     The queue and DLQ ARNs are exposed as outputs so callers can scope their
#     policies to the EXACT ARN.
# ---------------------------------------------------------------------------

# ---- Dead Letter Queue -------------------------------------------------------
# Provisioned first so its ARN is available for the main queue's redrive_policy.

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.queue_name_prefix}-dlq"
  message_retention_seconds = var.dlq_message_retention_seconds
}

# ---- Main Queue --------------------------------------------------------------
# Standard queue with a redrive policy that moves messages to the DLQ after
# maxReceiveCount unsuccessful delivery attempts.

resource "aws_sqs_queue" "main" {
  name                       = "${var.queue_name_prefix}-main"
  visibility_timeout_seconds = var.visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })
}
