# ---------------------------------------------------------------------------
# App IRSA — least-privilege IAM role for the application ServiceAccount.
#
# The POST /<resource> endpoint writes objects to the team's S3 bucket. The
# pod obtains temporary credentials through IRSA (no static keys, no secrets in
# the image). The policy is scoped to the SPECIFIC bucket ARN — no wildcard
# resource (rubric: "Wildcard resource ARNs are not acceptable").
#
# Database access does NOT need IAM: Postgres uses password auth over the
# private network (db-sg ← app-sg), with the password injected via a Secret.
# ---------------------------------------------------------------------------

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
}

resource "aws_iam_policy" "app_s3" {
  name        = "${var.cluster_name}-app-s3"
  description = "Least-privilege S3 access for the ticket-system API pods (PutObject/GetObject/ListBucket on the attachments bucket only)."
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
