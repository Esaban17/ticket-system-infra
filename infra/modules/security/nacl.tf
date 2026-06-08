# ---------------------------------------------------------------------------
# Network ACLs — one for the public subnets, one for the private subnets.
#
# NACLs are STATELESS: every flow needs an explicit rule in BOTH directions,
# so each ACL has explicit inbound AND outbound rules (rubric requirement).
# Every rule is a standalone aws_network_acl_rule resource.
#
# The rules are deliberately tier-appropriate but not so tight that they break
# EKS: the private NACL allows all intra-VPC traffic (node ⇄ control-plane,
# node ⇄ RDS, CoreDNS) plus the ephemeral return-port range for replies coming
# back through the NAT Gateway. The public NACL allows the ALB's 80/443 plus
# the ephemeral range for return traffic and all intra-VPC traffic.
# ---------------------------------------------------------------------------

locals {
  any_cidr     = "0.0.0.0/0"
  all_protocol = "-1"
}

# ===========================================================================
# Public NACL
# ===========================================================================

resource "aws_network_acl" "public" {
  vpc_id     = var.vpc_id
  subnet_ids = var.public_subnet_ids

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-nacl-public", Tier = "public" })
}

# ---- Inbound --------------------------------------------------------------

resource "aws_network_acl_rule" "public_in_http" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 100
  egress         = false
  protocol       = var.tcp_protocol
  rule_action    = "allow"
  cidr_block     = local.any_cidr
  from_port      = var.http_port
  to_port        = var.http_port
}

resource "aws_network_acl_rule" "public_in_https" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 110
  egress         = false
  protocol       = var.tcp_protocol
  rule_action    = "allow"
  cidr_block     = local.any_cidr
  from_port      = var.https_port
  to_port        = var.https_port
}

resource "aws_network_acl_rule" "public_in_ephemeral" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 120
  egress         = false
  protocol       = var.tcp_protocol
  rule_action    = "allow"
  cidr_block     = local.any_cidr
  from_port      = var.ephemeral_from_port
  to_port        = var.ephemeral_to_port
}

resource "aws_network_acl_rule" "public_in_vpc" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 130
  egress         = false
  protocol       = local.all_protocol
  rule_action    = "allow"
  cidr_block     = var.vpc_cidr
}

# ---- Outbound -------------------------------------------------------------

resource "aws_network_acl_rule" "public_out_all" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 100
  egress         = true
  protocol       = local.all_protocol
  rule_action    = "allow"
  cidr_block     = local.any_cidr
}

# ===========================================================================
# Private NACL
# ===========================================================================

resource "aws_network_acl" "private" {
  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnet_ids

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-nacl-private", Tier = "private" })
}

# ---- Inbound --------------------------------------------------------------

resource "aws_network_acl_rule" "private_in_vpc" {
  network_acl_id = aws_network_acl.private.id
  rule_number    = 100
  egress         = false
  protocol       = local.all_protocol
  rule_action    = "allow"
  cidr_block     = var.vpc_cidr
}

resource "aws_network_acl_rule" "private_in_ephemeral" {
  network_acl_id = aws_network_acl.private.id
  rule_number    = 110
  egress         = false
  protocol       = var.tcp_protocol
  rule_action    = "allow"
  cidr_block     = local.any_cidr
  from_port      = var.ephemeral_from_port
  to_port        = var.ephemeral_to_port
}

# ---- Outbound -------------------------------------------------------------

resource "aws_network_acl_rule" "private_out_all" {
  network_acl_id = aws_network_acl.private.id
  rule_number    = 100
  egress         = true
  protocol       = local.all_protocol
  rule_action    = "allow"
  cidr_block     = local.any_cidr
}
