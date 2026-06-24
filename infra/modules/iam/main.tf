# ---------------------------------------------------------------------------
# Centralized IAM module (Delivery 5 — Deliverable A).
#
# Single home for the four project IAM roles + the application/consumer
# policies, so every privilege grant is reviewable in one place and every
# ARN is exported as an output consumed by the functional modules:
#
#   1. lambda_exec  — Lambda execution role (compute module): CloudWatch Logs
#                     on the function's own log group + S3 (List/Put) on the
#                     attachments bucket + AWS-managed VPC access policy.
#   2. scheduler    — EventBridge Scheduler role: lambda:InvokeFunction on the
#                     ONE target Lambda (ARN composed by name to avoid a cycle
#                     with the compute module).
#   3. ci_runner    — GitHub Actions OIDC role: PowerUserAccess (managed) +
#                     a prefix-scoped iam:* inline policy (no Resource="*").
#   4. (policies)   — app_s3 + consumer policies consumed by the ingress IRSA
#                     roles (the IRSA trust/roles stay in the ingress module).
#
# Rubric: NO Action="*" and NO Resource="*" in any policy document we author.
# The only wildcards are the AWS-managed policies (PowerUserAccess,
# AWSLambdaVPCAccessExecutionRole) which we attach but do not author.
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name

  # Log group ARN composed by name (no dependency on the compute module's
  # aws_cloudwatch_log_group resource) so the IAM module can run before compute.
  log_group_arn = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.function_name}:*"

  # Target Lambda ARN composed by NAME, not by reference to module.compute.
  # This breaks the iam <-> compute cycle: compute needs the role ARN from iam,
  # and iam needs the Lambda ARN for the scheduler policy. Composing the ARN
  # from the (deterministic) function name lets iam run first.
  target_lambda_arn = "arn:aws:lambda:${local.region}:${local.account_id}:function:${var.function_name}"

  # Prefix-scoped IAM resource ARNs for the CI runner (no Resource="*").
  ci_iam_role_arns   = "arn:aws:iam::${local.account_id}:role/${var.name_prefix}-*"
  ci_iam_policy_arns = "arn:aws:iam::${local.account_id}:policy/${var.name_prefix}-*"
}

# ===========================================================================
# 1. Lambda execution role
# ===========================================================================

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    sid     = "AllowLambdaServiceToAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${var.function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  description        = "Execution role for the ${var.function_name} Lambda. CloudWatch Logs on its own log group + scoped S3 access."
}

# CloudWatch Logs scoped to THIS function's log group (no wildcard resource).
data "aws_iam_policy_document" "lambda_logs" {
  statement {
    sid    = "AllowLambdaToWriteLogs"
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = [local.log_group_arn]
  }
}

resource "aws_iam_role_policy" "lambda_logs" {
  name   = "${var.function_name}-logs"
  role   = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_logs.json
}

# S3 access scoped to the attachments bucket ARN (List on bucket, Put on /*).
data "aws_iam_policy_document" "lambda_s3" {
  statement {
    sid       = "AllowLambdaToListBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arn]
  }

  statement {
    sid       = "AllowLambdaToWriteReports"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${var.bucket_arn}/*"]
  }
}

resource "aws_iam_role_policy" "lambda_s3" {
  name   = "${var.function_name}-s3"
  role   = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_s3.json
}

# ---- Secrets Manager + KMS (Delivery 5 — Deliverable B) ---------------------
# Scoped to the EXACT secret + key ARNs (no wildcards):
#   - secretsmanager:GetSecretValue on the DB credentials secret
#   - kms:Decrypt to unwrap that secret AND kms:GenerateDataKey because the
#     attachments bucket is now SSE-KMS, so the Lambda's s3:PutObject must wrap
#     an object data key. Reubicado desde el módulo compute (D5-B se construyó
#     sobre la estructura pre-A); ahora vive aquí junto al resto de los grants.
data "aws_iam_policy_document" "lambda_secrets" {
  count = var.secret_arn != "" || var.kms_key_arn != "" ? 1 : 0

  dynamic "statement" {
    for_each = var.secret_arn != "" ? [1] : []
    content {
      sid       = "AllowReadDbCredentialsSecret"
      effect    = "Allow"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [var.secret_arn]
    }
  }

  dynamic "statement" {
    for_each = var.kms_key_arn != "" ? [1] : []
    content {
      sid    = "AllowDecryptAndGenerateDataKey"
      effect = "Allow"
      actions = [
        "kms:Decrypt",
        "kms:GenerateDataKey",
      ]
      resources = [var.kms_key_arn]
    }
  }
}

resource "aws_iam_role_policy" "lambda_secrets" {
  count  = var.secret_arn != "" || var.kms_key_arn != "" ? 1 : 0
  name   = "${var.function_name}-secrets-kms"
  role   = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_secrets[0].json
}

# AWS-managed policy required for VPC-attached Lambdas (manages ENIs). Attaching
# the managed policy keeps our own documents free of Resource="*".
resource "aws_iam_role_policy_attachment" "lambda_vpc_access" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# ===========================================================================
# 2. Scheduler role (EventBridge Scheduler -> Lambda)
# ===========================================================================

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
  name               = "${var.name_prefix}-report-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume_role.json
  description        = "Least-privilege role for EventBridge Scheduler - only lambda:InvokeFunction on the report-generator Lambda ARN."
}

# Only lambda:InvokeFunction on the SPECIFIC target Lambda ARN (no wildcard).
# Uses var.target_lambda_arn when supplied, else the name-composed ARN. The
# name-composed default keeps iam independent of the compute module.
data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    sid       = "AllowInvokeTargetLambda"
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.target_lambda_arn != "" ? var.target_lambda_arn : local.target_lambda_arn]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "${var.name_prefix}-report-scheduler-invoke"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

# ===========================================================================
# 3. App + consumer policies (consumed by ingress IRSA roles)
# ===========================================================================

# ---- App (producer/API) policy: S3 + scoped SQS SendMessage ----------------
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

  # sqs:SendMessage on the SPECIFIC queue ARN (no wildcard). Only added when a
  # queue ARN is supplied (backward-compatible).
  dynamic "statement" {
    for_each = var.sqs_queue_arn != "" ? [1] : []
    content {
      sid       = "AllowProducerToSendMessages"
      effect    = "Allow"
      actions   = ["sqs:SendMessage"]
      resources = [var.sqs_queue_arn]
    }
  }

  # Delivery 5 — Deliverable B: the API pods read the DB credentials secret at
  # runtime via IRSA. secretsmanager:GetSecretValue scoped to the EXACT secret
  # ARN (no wildcard) and kms:Decrypt scoped to the EXACT CMK ARN to unwrap the
  # ciphertext. Each statement is gated on its ARN being set (backward-compatible).
  dynamic "statement" {
    for_each = var.secret_arn != "" ? [1] : []
    content {
      sid       = "AllowReadDbCredentialsSecret"
      effect    = "Allow"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [var.secret_arn]
    }
  }

  dynamic "statement" {
    for_each = var.kms_key_arn != "" ? [1] : []
    content {
      sid       = "AllowDecryptWithCmk"
      effect    = "Allow"
      actions   = ["kms:Decrypt", "kms:DescribeKey"]
      resources = [var.kms_key_arn]
    }
  }

  # EP-12 / BL-119: el API/consumer envía correos de notificación de tickets vía
  # SES. ses:SendEmail + ses:SendRawEmail scoped a la EXACTA identidad de email
  # verificada (no wildcard). Solo se agrega cuando se suministra el ARN.
  dynamic "statement" {
    for_each = var.ses_identity_arn != "" ? [1] : []
    content {
      sid       = "AllowSendTicketNotificationEmails"
      effect    = "Allow"
      actions   = ["ses:SendEmail", "ses:SendRawEmail"]
      resources = [var.ses_identity_arn]
    }
  }
}

resource "aws_iam_policy" "app_s3" {
  name        = "${var.name_prefix}-app-s3"
  description = "Least-privilege S3 + SQS access for the ticket-system API pods (PutObject/GetObject/ListBucket on attachments bucket; sqs:SendMessage on async queue)."
  policy      = data.aws_iam_policy_document.app_s3.json
  tags        = var.tags
}

# ---- Consumer (async worker) policy: scoped SQS poll + S3 PutObject ---------
data "aws_iam_policy_document" "consumer" {
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

  # EP-12 / BL-119: el consumer es quien DESPACHA el correo (procesa el mensaje
  # SQS de notificación y llama a SES). ses:SendEmail + ses:SendRawEmail scoped a
  # la EXACTA identidad verificada (no wildcard). Solo cuando se suministra el ARN.
  dynamic "statement" {
    for_each = var.ses_identity_arn != "" ? [1] : []
    content {
      sid       = "AllowConsumerToSendNotificationEmails"
      effect    = "Allow"
      actions   = ["ses:SendEmail", "ses:SendRawEmail"]
      resources = [var.ses_identity_arn]
    }
  }
}

resource "aws_iam_policy" "consumer" {
  name        = "${var.name_prefix}-consumer-sqs-s3"
  description = "Least-privilege SQS + S3 access for the ticket-system async consumer pods (ReceiveMessage/DeleteMessage/GetQueueAttributes on async queue; PutObject on attachments bucket)."
  policy      = data.aws_iam_policy_document.consumer.json
  tags        = var.tags
}

# ===========================================================================
# 4. GitHub Actions OIDC provider + CI runner role (prepared for Deliverable C)
# ===========================================================================

# The GitHub Actions OIDC provider is ACCOUNT-GLOBAL (AWS allows exactly one per
# URL) and already exists in this account, shared with another project
# (rubik-frontend-gh-actions trusts it). We therefore REFERENCE it via a data
# source instead of creating/owning it: owning it would (a) collide on apply
# (EntityAlreadyExists) and (b) destroy a sibling project's CI federation on our
# Deliverable-F teardown. The federation is still fully provisioned-as-code — the
# trust is established by the ci_runner role's assume_role_policy below. See
# docs/iac-coverage.md for the rationale.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

# Trust policy: federated to the GitHub OIDC provider, locked to the specific
# repo + branch ref (aud = sts.amazonaws.com, sub = repo:org/repo:ref:branch).
data "aws_iam_policy_document" "ci_runner_assume_role" {
  statement {
    sid     = "AllowGitHubActionsToAssume"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Push-to-main jobs present sub = repo:org/repo:ref:refs/heads/main. But jobs
    # that target a GitHub Environment (apply-dev/apply-staging) present
    # sub = repo:org/repo:environment:<env> INSTEAD of the ref. Allow both — a
    # LIST of EXACT subjects scoped to this repo + main branch + the named
    # environments (NOT a wildcard; a PR/fork/other-branch still cannot assume).
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = concat(
        ["repo:${var.github_org}/${var.github_repo}:ref:${var.github_branch_ref}"],
        [for env in var.github_environments : "repo:${var.github_org}/${var.github_repo}:environment:${env}"],
      )
    }
  }
}

resource "aws_iam_role" "ci_runner" {
  name               = "${var.name_prefix}-ci-runner-role"
  assume_role_policy = data.aws_iam_policy_document.ci_runner_assume_role.json
  description        = "GitHub Actions OIDC role used by CI to run terraform plan/apply for ${var.github_org}/${var.github_repo} (${var.github_branch_ref})."
  tags               = var.tags
}

# PowerUserAccess: full access to AWS services EXCEPT IAM and Organizations.
# The CI runner applies the entire stack, so a broad grant is pragmatic; the
# deliberate IAM exclusion is closed below by a PREFIX-SCOPED iam policy rather
# than Resource="*" (rubric trade-off documented in the module header + notes).
resource "aws_iam_role_policy_attachment" "ci_runner_poweruser" {
  role       = aws_iam_role.ci_runner.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# IAM permissions the CI runner needs to manage THIS project's roles/policies/
# OIDC provider, scoped by name prefix + the OIDC provider ARN. No Resource="*".
data "aws_iam_policy_document" "ci_runner_iam" {
  statement {
    sid    = "ManageProjectIamRolesAndPolicies"
    effect = "Allow"
    actions = [
      "iam:GetRole",
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:ListRoleTags",
      "iam:PassRole",
      "iam:GetRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:CreatePolicy",
      "iam:DeletePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion",
      "iam:ListPolicyVersions",
      "iam:TagPolicy",
      "iam:UntagPolicy",
      "iam:ListInstanceProfilesForRole",
    ]
    resources = [
      local.ci_iam_role_arns,
      local.ci_iam_policy_arns,
    ]
  }

  # The OIDC provider is referenced via data source (account-global, shared), so
  # CI only needs to READ it (terraform data lookup), never create/delete it.
  statement {
    sid    = "ReadGithubOidcProvider"
    effect = "Allow"
    actions = [
      "iam:GetOpenIDConnectProvider",
    ]
    resources = [data.aws_iam_openid_connect_provider.github.arn]
  }
}

resource "aws_iam_role_policy" "ci_runner_iam" {
  name   = "${var.name_prefix}-ci-runner-iam"
  role   = aws_iam_role.ci_runner.id
  policy = data.aws_iam_policy_document.ci_runner_iam.json
}
