# ---------------------------------------------------------------------------
# KMS module — Customer Managed Key (CMK) for encryption at rest.
#
# Delivery 5 — Deliverable B. A single CMK with automatic rotation enabled,
# used to encrypt:
#   - the S3 attachments bucket (SSE-KMS, bucket_key_enabled)
#   - the RDS PostgreSQL instance (storage encryption)
#   - the Secrets Manager secret holding the DB credentials
#
# Key policy (least privilege, no open "kms:*" to root):
#   (a) ADMIN statement — scoped administrative actions to the account root so
#       the key remains manageable (no data-plane Encrypt/Decrypt granted here).
#   (b) SERVICE statement — secretsmanager.amazonaws.com may Decrypt /
#       GenerateDataKey / CreateGrant to wrap/unwrap the secret material.
#   (c) DATA-PLANE statement — the runtime execution roles (Lambda exec role +
#       app IRSA role) may Decrypt / GenerateDataKey / DescribeKey.
#
# CYCLE-BREAKING NOTE (iam <-> kms):
#   The runtime role ARNs are composed BY NAME via data.aws_caller_identity
#   (passed in as var.allowed_role_arns by the root) instead of referencing the
#   IAM/IRSA modules directly. This keeps the dependency graph one-directional
#   (kms -> consumers) and lets the IAM policies reference module.kms.key_arn
#   without forming a cycle.
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "key" {
  # (a) Administrative actions to the account root — scoped, NOT "kms:*".
  statement {
    sid    = "AllowRootAccountAdministration"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    actions = [
      "kms:Create*",
      "kms:Describe*",
      "kms:List*",
      "kms:Get*",
      "kms:Put*",
      "kms:Update*",
      "kms:Revoke*",
      "kms:Disable*",
      "kms:Enable*",
      "kms:TagResource",
      "kms:UntagResource",
      "kms:ScheduleKeyDeletion",
      "kms:CancelKeyDeletion",
    ]

    resources = ["*"]
  }

  # (b) Secrets Manager service principal — wrap/unwrap secret material.
  statement {
    sid    = "AllowSecretsManagerUse"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["secretsmanager.amazonaws.com"]
    }

    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
      "kms:CreateGrant",
    ]

    resources = ["*"]
  }

  # (c) Runtime execution roles — data-plane decrypt for the app + Lambda.
  # Only emitted when at least one role ARN is provided to avoid an empty
  # principals block (invalid policy).
  dynamic "statement" {
    for_each = length(var.allowed_role_arns) > 0 ? [1] : []

    content {
      sid    = "AllowRuntimeRolesDataPlane"
      effect = "Allow"

      principals {
        type        = "AWS"
        identifiers = var.allowed_role_arns
      }

      actions = [
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "kms:DescribeKey",
      ]

      resources = ["*"]
    }
  }
}

resource "aws_kms_key" "main" {
  description             = "${var.name_prefix} CMK — encrypts S3 attachments, RDS storage and the DB credentials secret."
  enable_key_rotation     = true
  deletion_window_in_days = var.deletion_window_in_days
  policy                  = data.aws_iam_policy_document.key.json
}

resource "aws_kms_alias" "main" {
  name          = "alias/${var.name_prefix}-cmk"
  target_key_id = aws_kms_key.main.key_id
}
