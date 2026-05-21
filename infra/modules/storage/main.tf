# ---------------------------------------------------------------------------
# Storage module — S3 bucket for ticket attachments and resolution reports.
#
# Rubric requirements (Delivery 2 — Storage Module):
#   - Versioning enabled
#   - At least one lifecycle rule with a specific prefix/filter (not bucket-wide)
#   - Server-side encryption (SSE-S3 is sufficient at this stage)
#   - Bucket policy enforcing SSL-only access (aws:SecureTransport)
#   - Public access fully blocked
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "this" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy
}

# ---- Versioning -----------------------------------------------------------

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

# ---- Server-side encryption (SSE-S3 / AES256) -----------------------------

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ---- Public access block --------------------------------------------------

resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---- Lifecycle rule (scoped to attachments/) ------------------------------
# The filter prefix is required by the rubric: lifecycle rules must NOT apply
# to the entire bucket without a scope.

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  # Depends on versioning so the noncurrent rule is meaningful.
  depends_on = [aws_s3_bucket_versioning.this]

  rule {
    id     = "transition-attachments-to-ia-and-expire-noncurrent"
    status = "Enabled"

    filter {
      prefix = var.lifecycle_prefix
    }

    transition {
      days          = var.transition_to_ia_days
      storage_class = "STANDARD_IA"
    }

    noncurrent_version_expiration {
      noncurrent_days = var.expire_noncurrent_versions_days
    }
  }
}

# ---- SSL-only bucket policy ----------------------------------------------
# Denies any request that doesn't use TLS (aws:SecureTransport = false).
# The Deny statement applies to BOTH the bucket and its objects.

data "aws_iam_policy_document" "ssl_only" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.this.arn,
      "${aws_s3_bucket.this.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "ssl_only" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.ssl_only.json

  # Public-access-block must be set before the policy in case the policy
  # contains principals that would otherwise count as public.
  depends_on = [aws_s3_bucket_public_access_block.this]
}
