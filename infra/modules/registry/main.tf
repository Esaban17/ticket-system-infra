# ---------------------------------------------------------------------------
# Registry module — private Amazon ECR repository for the API container image.
#
# BL-101 requirements:
#   - image_tag_mutability = IMMUTABLE (a tag once pushed cannot be overwritten;
#     protects against silent rollbacks where ":latest" or ":v1.2.3" changes
#     underneath a running deployment)
#   - scan_on_push = true (Inspector / native ECR scan triggered on each push)
#   - AES256 encryption at rest (SSE-S3 equivalent; KMS not required here)
#   - Lifecycle policy: retain last 10 tagged images, expire untagged after 7 days
#
# Lives in its own module instead of being added to compute/ because compute/
# currently provisions the Lambda worker; mixing a container registry with a
# Lambda function would muddle the module boundary.
#
# create_repository = true  (default) — dev: create and manage the ECR repo.
# create_repository = false            — staging: read the existing repo via a
#   data source. Staging reuses the same images as dev (same account/region).
#   A data source ensures staging never manages — and can never destroy — the
#   shared repo (a terraform destroy of staging with force_delete=true would
#   otherwise wipe dev's images).
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "this" {
  count = var.create_repository ? 1 : 0

  name                 = var.repository_name
  image_tag_mutability = "IMMUTABLE"

  # El CD empuja imágenes continuamente; sin esto `terraform destroy` falla
  # con RepositoryNotEmptyException (visto en el teardown del 2026-06-10).
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  # Tags inherited from provider default_tags (Project, Environment, ManagedBy)
  # are merged automatically by AWS. Anything passed via var.tags layers on top.
  tags = merge(
    {
      Name      = var.repository_name
      Component = "registry"
    },
    var.tags,
  )
}

# Read-only path: staging resolves the pre-existing repo created by dev.
data "aws_ecr_repository" "existing" {
  count = var.create_repository ? 0 : 1
  name  = var.repository_name
}

# ---- Lifecycle policy ----------------------------------------------------
# Rules are evaluated in ascending rulePriority order. We expire untagged
# images first (priority 1) because that rule is cheap to evaluate, then cap
# the number of tagged images (priority 2). The tagPrefixList of ["*"] matches
# any tagged image regardless of prefix.

resource "aws_ecr_lifecycle_policy" "this" {
  count      = var.create_repository ? 1 : 0
  repository = aws_ecr_repository.this[0].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after ${var.untagged_expiry_days} days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = var.untagged_expiry_days
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Retain only the last ${var.max_tagged_images} tagged images"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["*"]
          countType      = "imageCountMoreThan"
          countNumber    = var.max_tagged_images
        }
        action = {
          type = "expire"
        }
      },
    ]
  })
}

# ---- State migration (dev only, no-op in staging) ------------------------
# Introducing count = 1 on pre-existing resources would force a destroy +
# recreate without these moved blocks (Terraform sees the unindexed address
# as deleted and the indexed one as new). The moved blocks instruct Terraform
# to rename the state address without making any AWS API calls. In staging
# (fresh empty state) these blocks are no-ops.

moved {
  from = aws_ecr_repository.this
  to   = aws_ecr_repository.this[0]
}

moved {
  from = aws_ecr_lifecycle_policy.this
  to   = aws_ecr_lifecycle_policy.this[0]
}
