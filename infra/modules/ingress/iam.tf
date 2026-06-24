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

# NOTE (Delivery 5, Deliverable A): the app_s3 and consumer aws_iam_policy
# resources (and their policy documents) were CENTRALIZED into ./modules/iam.
# Their ARNs flow in via var.app_policy_arn / var.consumer_policy_arn and are
# attached to the IRSA roles below. The IRSA trust/role objects (the community
# iam-role-for-service-accounts-eks module) stay here because they bind to the
# cluster OIDC provider — only the policy DEFINITIONS moved.

# ---- 1. App IRSA (producer: API pods) ----------------------------------------

module "app_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.39"

  role_name = "${var.cluster_name}-app"

  role_policy_arns = {
    s3 = var.app_policy_arn
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
# Separate role attached to the consumer policy (created in ./modules/iam):
#   - sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes (polling)
#   - s3:PutObject on bucket/* (write processed-message object per message)
# Only provisioned when var.sqs_queue_arn is set (D4 feature gate).

module "consumer_irsa" {
  count   = var.sqs_queue_arn != "" ? 1 : 0
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.39"

  role_name = "${var.cluster_name}-consumer"

  role_policy_arns = {
    sqs_s3 = var.consumer_policy_arn
  }

  oidc_providers = {
    main = {
      provider_arn               = var.oidc_provider_arn
      namespace_service_accounts = ["${var.namespace}:${var.consumer_sa_name}"]
    }
  }

  tags = var.tags
}
