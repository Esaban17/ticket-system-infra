# ---------------------------------------------------------------------------
# BL-109 — VPC endpoints.
#
# Gateway endpoint  : S3   — free, attached to private route tables. Saves
#                            NAT processing cost on S3 traffic (uploads of
#                            ticket attachments are the largest flow).
# Interface endpoints: ECR (api + dkr), Secrets Manager, CloudWatch Logs,
#                     SQS — billed per-AZ per-endpoint (~7 USD/month each)
#                     but they avoid NAT egress for control-plane chatter
#                     and keep the traffic on AWS' private network.
#
# All interface endpoints share a single Security Group that allows inbound
# 443 only from inside the VPC CIDR.
# ---------------------------------------------------------------------------

data "aws_region" "current" {}

locals {
  region                 = data.aws_region.current.name
  interface_endpoint_set = toset(var.interface_endpoint_services)
}

# ---- S3 Gateway endpoint --------------------------------------------------
# Attached to every PRIVATE route table so workloads in private subnets reach
# S3 directly. Public-tier traffic to S3 already goes via the IGW for free,
# so we do not associate the public route table.

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${local.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-vpce-s3"
  })
}

# ---- Security group for interface endpoints -------------------------------
# Single SG reused by every interface endpoint. Ingress 443 from the VPC CIDR
# only — clients in private subnets resolve the endpoint's private DNS name
# and connect over TLS. Egress is left fully open (default) because the ENIs
# themselves do not initiate outbound calls.

resource "aws_security_group" "vpc_endpoints" {
  name        = "${var.name_prefix}-vpce-sg"
  description = "Allow HTTPS from inside the VPC to interface VPC endpoints."
  vpc_id      = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-vpce-sg"
  })
}

resource "aws_security_group_rule" "vpc_endpoints_ingress_https" {
  type              = "ingress"
  security_group_id = aws_security_group.vpc_endpoints.id
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = [aws_vpc.this.cidr_block]
  description       = "HTTPS from VPC CIDR to interface endpoints."
}

# ---- Interface endpoints --------------------------------------------------

resource "aws_vpc_endpoint" "interface" {
  for_each = local.interface_endpoint_set

  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${local.region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-vpce-${replace(each.value, ".", "-")}"
  })
}
