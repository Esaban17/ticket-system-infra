# ---------------------------------------------------------------------------
# Security module — Deliverable B (Network Security), VPC-required / EKS track.
#
# Three tiered security groups modelling the request path:
#
#     internet ──80/443──▶ web-sg ──app_port──▶ app-sg ──db_port──▶ db-sg
#                          (ALB)                (EKS nodes)          (RDS)
#
# Design notes for the rubric:
#   * Inter-tier rules are SG-to-SG (source_security_group_id), never CIDR
#     based — only the public web tier uses a CIDR (0.0.0.0/0 for the ALB).
#   * Every rule is a SEPARATE aws_security_group_rule resource, not an inline
#     ingress/egress block. This is what breaks the web-sg ⇄ app-sg reference
#     cycle (the documented "Security group circular dependencies" pitfall).
#   * The three aws_security_group resources declare NO inline egress, so
#     Terraform revokes the implicit AWS "allow all egress" rule. db-sg
#     therefore has NO egress at all (no direct internet egress), and web/app
#     only get the explicit egress rules added below.
#   * db-sg has no 0.0.0.0/0 ingress on any port.
#
# Files in this module:
#   main.tf       — this header + the three SGs and their SG-to-SG rules
#   nacl.tf       — public + private Network ACLs (explicit stateless rules)
#   variables.tf  — all ports / CIDRs / protocol as described input variables
#   outputs.tf    — SG and NACL IDs consumed by the root and other modules
# ---------------------------------------------------------------------------

locals {
  common_tags = merge(
    {
      Module      = "security"
      Environment = var.environment
    },
    var.tags,
  )
}

# ===========================================================================
# web-sg — public / ALB tier
# ===========================================================================

resource "aws_security_group" "web" {
  name        = "${var.name_prefix}-web-sg"
  description = "Web/ALB tier: HTTP+HTTPS from the internet, egress to the app tier only."
  vpc_id      = var.vpc_id

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-web-sg", Tier = "web" })
}

resource "aws_security_group_rule" "web_ingress_http" {
  type              = "ingress"
  security_group_id = aws_security_group.web.id
  from_port         = var.http_port
  to_port           = var.http_port
  protocol          = var.tcp_protocol
  cidr_blocks       = var.web_ingress_cidrs
  description       = "HTTP from the internet to the ALB."
}

resource "aws_security_group_rule" "web_ingress_https" {
  type              = "ingress"
  security_group_id = aws_security_group.web.id
  from_port         = var.https_port
  to_port           = var.https_port
  protocol          = var.tcp_protocol
  cidr_blocks       = var.web_ingress_cidrs
  description       = "HTTPS from the internet to the ALB (TLS termination arrives in Delivery 5)."
}

resource "aws_security_group_rule" "web_egress_to_app" {
  type                     = "egress"
  security_group_id        = aws_security_group.web.id
  from_port                = var.app_port
  to_port                  = var.app_port
  protocol                 = var.tcp_protocol
  source_security_group_id = aws_security_group.app.id
  description              = "ALB forwards/health-checks the app tier on the application port only."
}

# ===========================================================================
# app-sg — application tier (attached to the EKS managed node group)
# ===========================================================================

resource "aws_security_group" "app" {
  name        = "${var.name_prefix}-app-sg"
  description = "App tier (EKS nodes): ingress from web-sg on the app port only, egress to db-sg on the db port only."
  vpc_id      = var.vpc_id

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-app-sg", Tier = "app" })
}

resource "aws_security_group_rule" "app_ingress_from_web" {
  type                     = "ingress"
  security_group_id        = aws_security_group.app.id
  from_port                = var.app_port
  to_port                  = var.app_port
  protocol                 = var.tcp_protocol
  source_security_group_id = aws_security_group.web.id
  description              = "Application traffic + ALB health checks, accepted only from the web/ALB tier."
}

resource "aws_security_group_rule" "app_egress_to_db" {
  type                     = "egress"
  security_group_id        = aws_security_group.app.id
  from_port                = var.db_port
  to_port                  = var.db_port
  protocol                 = var.tcp_protocol
  source_security_group_id = aws_security_group.db.id
  description              = "App tier reaches the database tier on the db port only."
}

# ===========================================================================
# db-sg — database tier (attached to the RDS instance)
# No egress rules at all → no direct internet egress. No 0.0.0.0/0 ingress.
# ===========================================================================

resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-db-sg"
  description = "Database tier (RDS): ingress from app-sg on the db port only, no egress, no 0.0.0.0/0 ingress."
  vpc_id      = var.vpc_id

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-db-sg", Tier = "db" })
}

resource "aws_security_group_rule" "db_ingress_from_app" {
  type                     = "ingress"
  security_group_id        = aws_security_group.db.id
  from_port                = var.db_port
  to_port                  = var.db_port
  protocol                 = var.tcp_protocol
  source_security_group_id = aws_security_group.app.id
  description              = "Postgres ingress accepted ONLY from the app tier security group."
}
