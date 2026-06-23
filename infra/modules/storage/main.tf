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

# ---- CORS (browser presigned uploads/downloads) ---------------------------
# The SPA uploads attachments with a cross-origin PUT to a presigned S3 URL
# (and downloads with a presigned GET). The browser issues a CORS preflight,
# so the bucket must echo Access-Control-Allow-Origin for the SPA's origin or
# the upload fails with "No 'Access-Control-Allow-Origin' header". Scoped to
# the configured origins (least privilege); disabled entirely when the list is
# empty. The presigned URL itself is the authorization — CORS only governs
# which browser origins may issue the request and read the response.

resource "aws_s3_bucket_cors_configuration" "this" {
  count  = length(var.cors_allowed_origins) > 0 ? 1 : 0
  bucket = aws_s3_bucket.this.id

  cors_rule {
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
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
#
# Tiered cost optimisation for ticket attachments / resolution reports:
#   STANDARD ──(transition_to_ia_days)──▶ STANDARD_IA
#            ──(transition_to_glacier_days)──▶ GLACIER  (optional)
#            ──(expire_current_days)──▶ expired         (optional)
#
# The Glacier transition and the current-version expiration are OPTIONAL and
# fully driven by variables: setting their *_days inputs to <= 0 disables the
# corresponding block via the dynamic blocks below. The module's defaults keep
# expire_current_days = 0, so the historical behaviour (transition to IA +
# expire noncurrent versions only) is preserved unless a caller opts in.

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  # Depends on versioning so the noncurrent rule is meaningful.
  depends_on = [aws_s3_bucket_versioning.this]

  # El orden entre tiers (IA → Glacier → expiración) requiere referencias entre
  # variables, no permitidas en validaciones de variable bajo TF < 1.9; se
  # expresa aquí como preconditions (sí soportan referencias cruzadas).
  lifecycle {
    precondition {
      condition     = var.transition_to_glacier_days <= 0 || var.transition_to_glacier_days > var.transition_to_ia_days
      error_message = "transition_to_glacier_days debe ser mayor que transition_to_ia_days (o <= 0 para deshabilitar Glacier)."
    }
    precondition {
      condition     = var.expire_current_days <= 0 || var.transition_to_glacier_days <= 0 || var.expire_current_days > var.transition_to_glacier_days
      error_message = "expire_current_days debe ser mayor que transition_to_glacier_days cuando ambos están habilitados (o <= 0 para deshabilitarlo)."
    }
  }

  rule {
    id     = "transition-attachments-tiered-and-expire"
    status = "Enabled"

    filter {
      prefix = var.lifecycle_prefix
    }

    # Current versions move to the cheaper STANDARD_IA tier first.
    transition {
      days          = var.transition_to_ia_days
      storage_class = "STANDARD_IA"
    }

    # Optional archival transition to GLACIER for cold objects.
    dynamic "transition" {
      for_each = var.transition_to_glacier_days > 0 ? [1] : []

      content {
        days          = var.transition_to_glacier_days
        storage_class = "GLACIER"
      }
    }

    # Optional final expiration of current versions (adds a delete marker).
    dynamic "expiration" {
      for_each = var.expire_current_days > 0 ? [1] : []

      content {
        days = var.expire_current_days
      }
    }

    # Non-current versions (from versioning) are always cleaned up.
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
