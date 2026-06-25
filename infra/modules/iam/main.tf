# ---------------------------------------------------------------------------
# Centralized IAM module (Delivery 5 — Deliverable A).
#
# Single home for the project's runtime IAM roles + the application/consumer
# policies, so every privilege grant is reviewable in one place and every
# ARN is exported as an output consumed by the functional modules:
#
#   1. lambda_exec  — Lambda execution role (compute module): CloudWatch Logs
#                     on the function's own log group + S3 (List/Put) on the
#                     attachments bucket + AWS-managed VPC access policy.
#   2. scheduler    — EventBridge Scheduler role: lambda:InvokeFunction on the
#                     ONE target Lambda (ARN composed by name to avoid a cycle
#                     with the compute module).
#   3. (policies)   — app_s3 + consumer policies consumed by the ingress IRSA
#                     roles (the IRSA trust/roles stay in the ingress module).
#
# NOTE: the CI runner role (GitHub Actions OIDC) is intentionally NOT here — it
# lives in infra/bootstrap so it SURVIVES `terraform destroy` of this stack (a
# main-stack-owned CI role deletes its own credentials mid-destroy; incident
# 2026-06-25). The bootstrap is applied once and is never destroyed.
#
# Rubric: NO Action="*" and NO Resource="*" in any policy document we author.
# The only wildcard is the AWS-managed AWSLambdaVPCAccessExecutionRole we attach
# but do not author.
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
  # Gate on the STATIC bool, not on (secret_arn != "" || kms_key_arn != ""):
  # those ARNs are module outputs that are "known after apply" during the
  # two-phase -target apply, which makes count/for_each unpredictable and aborts
  # the plan. The root always wires both when secrets are enabled, so a static
  # flag is equivalent and resolvable at plan time.
  count = var.secrets_access_enabled ? 1 : 0

  statement {
    sid       = "AllowReadDbCredentialsSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.secret_arn]
  }

  statement {
    sid    = "AllowDecryptAndGenerateDataKey"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "lambda_secrets" {
  count  = var.secrets_access_enabled ? 1 : 0
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
  # Gated on the STATIC bool (not the apply-time ARN values) so the for_each is
  # resolvable at plan time during the two-phase -target apply.
  dynamic "statement" {
    for_each = var.secrets_access_enabled ? [1] : []
    content {
      sid       = "AllowReadDbCredentialsSecret"
      effect    = "Allow"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [var.secret_arn]
    }
  }

  # kms:Decrypt unwraps the DB-credentials secret; kms:GenerateDataKey is REQUIRED
  # because the attachments bucket is SSE-KMS: el API firma URLs prefirmadas de
  # PutObject y S3 genera la data key BAJO la identidad del firmante, así que sin
  # GenerateDataKey el PUT del navegador falla con 403 (mismo grant que el Lambda).
  dynamic "statement" {
    for_each = var.secrets_access_enabled ? [1] : []
    content {
      sid       = "AllowDecryptWithCmk"
      effect    = "Allow"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
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

  # El bucket de adjuntos es SSE-KMS, así que el s3:PutObject del consumer (objetos
  # async `async/<id>`) necesita generar la data key con la CMK. Sin esto, el PUT
  # falla con 403 y el mensaje acaba en la DLQ. Mismo grant que app/Lambda; gated
  # en el bool estático para que el for_each sea resoluble en plan-time.
  dynamic "statement" {
    for_each = var.secrets_access_enabled ? [1] : []
    content {
      sid       = "AllowConsumerUseCmkForS3"
      effect    = "Allow"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
      resources = [var.kms_key_arn]
    }
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
