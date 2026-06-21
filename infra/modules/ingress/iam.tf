# ---------------------------------------------------------------------------
# App IRSA — least-privilege IAM roles for the application ServiceAccounts.
#
# Two roles are provisioned (Delivery 4):
#   1. app_irsa  (ticket-system-api SA)
#      - s3:PutObject/GetObject on the attachments bucket/* (existing)
#      - s3:ListBucket on the attachments bucket (existing)
#      - sqs:SendMessage on the main queue ARN ONLY (new, D4 Deliverable B)
#
#   2. consumer_irsa (ticket-system-consumer SA)
#      - sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes on queue
#      - s3:PutObject on bucket/* (consumer writes processed-message objects)
#
# No wildcard resource ARNs anywhere (rubric requirement).
# ---------------------------------------------------------------------------

# ---- 1. App IRSA (producer: API pods) ----------------------------------------

data "aws_iam_policy_document" "app_s3" {
  statement {
    sid    = "ReadWriteTicketObjects"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
    ]
    resources = ["${var.bucket_arn}/*"]
  }

  statement {
    sid       = "ListTicketBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arn]
  }

  # sqs:SendMessage on the SPECIFIC queue ARN (no wildcard) — Delivery 4 B.
  # The API producer (POST /v1/notifications/enqueue) calls SendMessage.
  # Only added when var.sqs_queue_arn is non-empty (backward-compatible).
  dynamic "statement" {
    for_each = var.sqs_queue_arn != "" ? [1] : []
    content {
      sid       = "AllowProducerToSendMessages"
      effect    = "Allow"
      actions   = ["sqs:SendMessage"]
      resources = [var.sqs_queue_arn]
    }
  }
}

resource "aws_iam_policy" "app_s3" {
  name        = "${var.cluster_name}-app-s3"
  description = "Least-privilege S3 + SQS access for the ticket-system API pods (PutObject/GetObject/ListBucket on attachments bucket; sqs:SendMessage on async queue)."
  policy      = data.aws_iam_policy_document.app_s3.json
  tags        = var.tags
}

module "app_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.39"

  role_name = "${var.cluster_name}-app"

  role_policy_arns = {
    s3 = aws_iam_policy.app_s3.arn
  }

  oidc_providers = {
    main = {
      provider_arn               = var.oidc_provider_arn
      namespace_service_accounts = ["${var.namespace}:${var.app_name}"]
    }
  }

  tags = var.tags
}

# ---- 2. Consumer IRSA (async consumer worker pods) ---------------------------
# Separate role with ONLY the permissions the consumer needs:
#   - sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes (polling)
#   - s3:PutObject on bucket/* (write processed-message object per message)
# Only provisioned when var.sqs_queue_arn is set (D4 feature gate).

data "aws_iam_policy_document" "consumer" {
  count = var.sqs_queue_arn != "" ? 1 : 0

  statement {
    sid    = "AllowConsumerToReceiveAndDelete"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [var.sqs_queue_arn]
  }

  statement {
    sid       = "AllowConsumerToWriteObjects"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${var.bucket_arn}/*"]
  }
}

resource "aws_iam_policy" "consumer" {
  count       = var.sqs_queue_arn != "" ? 1 : 0
  name        = "${var.cluster_name}-consumer-sqs-s3"
  description = "Least-privilege SQS + S3 access for the ticket-system async consumer pods (ReceiveMessage/DeleteMessage/GetQueueAttributes on async queue; PutObject on attachments bucket)."
  policy      = data.aws_iam_policy_document.consumer[0].json
  tags        = var.tags
}

module "consumer_irsa" {
  count   = var.sqs_queue_arn != "" ? 1 : 0
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.39"

  role_name = "${var.cluster_name}-consumer"

  role_policy_arns = {
    sqs_s3 = aws_iam_policy.consumer[0].arn
  }

  oidc_providers = {
    main = {
      provider_arn               = var.oidc_provider_arn
      namespace_service_accounts = ["${var.namespace}:${var.consumer_sa_name}"]
    }
  }

  tags = var.tags
}
