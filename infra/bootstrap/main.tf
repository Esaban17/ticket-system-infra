# ---------------------------------------------------------------------------
# Bootstrap workspace — provisions the S3 bucket and DynamoDB table that
# back the REMOTE STATE of the main workspace (infra/).
#
# IMPORTANT:
#   - This workspace uses LOCAL state on purpose. Never add a backend block
#     here — it would create a circular dependency with the resources it
#     provisions.
#   - Both resources have prevent_destroy = true. An accidental `destroy`
#     becomes a PLAN error, not a runtime data-loss event.
#   - Run `terraform apply` here ONCE. After that, the main workspace
#     (infra/) reads its state from these resources.
# ---------------------------------------------------------------------------

# ---- S3 bucket that stores terraform.tfstate of the main workspace --------

resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---- DynamoDB table used as the state lock --------------------------------
#
# Terraform expects a string hash key named exactly "LockID". The table is
# tiny (single-item writes per apply) — PAY_PER_REQUEST is by far the
# cheapest billing mode for this workload.

resource "aws_dynamodb_table" "lock" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# ---------------------------------------------------------------------------
# CI runner role (GitHub Actions OIDC) — lives in the BOOTSTRAP, not the main
# stack.
#
# WHY HERE: the main workspace (infra/) is destroyed between deliveries. When
# the CI role lived in the main stack (modules/iam), `terraform destroy` deleted
# the very identity CI assumes to run apply/destroy — its in-flight credentials
# died mid-run, the state never saved, and the NEXT deploy was blocked (incident
# 2026-06-25). Owning the role here (local state, applied once) makes it survive
# every main-stack destroy, so deploys work transparently at any time.
#
# The role uses AdministratorAccess: the CI identity provisions the whole stack
# (including IAM/EKS resources with non-deterministic names), so scoping it
# precisely is impractical. The broad grant is confined to this CI-only role and
# locked by the OIDC trust to this repo + branch/environments.
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

# Account-global GitHub OIDC provider (one per account) — referenced, not owned.
data "aws_iam_openid_connect_provider" "github" {
  arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

# Trust: federated to GitHub OIDC, locked to this repo's main branch ref AND the
# named GitHub Environments (apply-dev/apply-staging jobs present an environment
# sub instead of the branch ref). A list of EXACT subjects — never a wildcard.
data "aws_iam_policy_document" "ci_runner_assume" {
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
  assume_role_policy = data.aws_iam_policy_document.ci_runner_assume.json
  description        = "GitHub Actions OIDC role for CI terraform plan/apply/destroy. Owned by the bootstrap so it survives main-stack destroys (incident 2026-06-25)."
}

resource "aws_iam_role_policy_attachment" "ci_runner_admin" {
  role       = aws_iam_role.ci_runner.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
