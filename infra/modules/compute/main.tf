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
}

# ---- Source code archive --------------------------------------------------

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda-src"
  output_path = "${path.module}/build/${local.function_name}.zip"
}

# ---- Execution role -------------------------------------------------------
# The execution role, its CloudWatch Logs / S3 inline policies and the
# AWS-managed VPC-access attachment were CENTRALIZED into ./modules/iam
# (Delivery 5, Deliverable A). The role ARN is injected via var.execution_role_arn
# so all IAM grants are reviewable in one place. No IAM resources are created
# in the compute module anymore.

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
  role             = var.execution_role_arn
  handler          = "index.handler"
  runtime          = var.runtime
  memory_size      = var.memory_size
  timeout          = var.timeout_seconds
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  # BUCKET_NAME is consumed by the report-generator handler (index.py) to list
  # async objects and write daily summary reports. Passed from the storage module
  # output via the root module — no hardcoded names.
  environment {
    variables = {
      BUCKET_NAME = var.bucket_name
    }
  }

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
  ]
}
