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
