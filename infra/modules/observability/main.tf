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
