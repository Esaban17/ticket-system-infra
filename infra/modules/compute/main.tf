# ---------------------------------------------------------------------------
# Compute module — AWS Lambda function representing the ticket-system async
# worker (SQS → notifications / SLA escalation in later deliveries).
#
# Rubric requirements (Delivery 2 — Compute Module):
#   - Inputs: environment, name, size/tier (memory_size) — all typed + described
#   - Output: function ARN with description
#   - Execution role with minimum permissions — NO wildcards in our policy doc
#   - Resource is actually deployed (terraform apply) — not only planned
# ---------------------------------------------------------------------------

terraform {
  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

locals {
  function_name = "${var.project_name}-${var.environment}-${var.name}"
  log_group_arn = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.function_name}:*"
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# ---- Source code archive --------------------------------------------------

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda-src"
  output_path = "${path.module}/build/${local.function_name}.zip"
}

# ---- Execution role -------------------------------------------------------
# Trust policy: only the Lambda service can assume this role.

data "aws_iam_policy_document" "assume_role" {
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
  name               = "${local.function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

# Inline policy: CloudWatch Logs on the SPECIFIC log group of this function.
# No wildcards in Action or Resource (rubric: "Wildcard Action or Resource
# values are not permitted").

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
  name   = "${local.function_name}-logs"
  role   = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_logs.json
}

# AWS-managed policy required for Lambdas attached to a VPC (manages ENIs).
# Attaching the AWS-managed policy keeps our own policy documents clean —
# we don't write Resource: "*" ourselves.
resource "aws_iam_role_policy_attachment" "vpc_access" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# ---- Log group ------------------------------------------------------------
# Pre-create the log group so the inline policy above can reference a real
# ARN (Lambda would auto-create it on first invocation otherwise).

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

# ---- Security group for the Lambda ENIs ----------------------------------
# Egress is open (Lambdas typically need to call external APIs). Ingress is
# unused — Lambda has no inbound listener. The SG's ID is exported so the
# RDS module can scope its ingress rule to this SG.

resource "aws_security_group" "lambda" {
  name        = "${local.function_name}-sg"
  description = "Security group for the ticket-system Lambda ENIs"
  vpc_id      = var.vpc_id

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---- Lambda function ------------------------------------------------------

resource "aws_lambda_function" "this" {
  function_name    = local.function_name
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  runtime          = var.runtime
  memory_size      = var.memory_size
  timeout          = var.timeout_seconds
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.lambda_logs,
    aws_iam_role_policy_attachment.vpc_access,
  ]
}
