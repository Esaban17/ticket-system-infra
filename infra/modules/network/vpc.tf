# ---------------------------------------------------------------------------
# BL-107 — VPC, subnets, route tables.
# ---------------------------------------------------------------------------

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-vpc"
  })
}

# ---- Subnets --------------------------------------------------------------
# Public subnets receive a public IP on launch so workloads placed there
# (NAT Gateway, ALB) get reachability without extra wiring.

resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    local.common_tags,
    local.cluster_tag,
    {
      Name                     = "${var.name_prefix}-public-${var.availability_zones[count.index]}"
      Tier                     = "public"
      "kubernetes.io/role/elb" = "1"
    },
  )
}

resource "aws_subnet" "private" {
  count = local.az_count

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = merge(
    local.common_tags,
    local.cluster_tag,
    {
      Name                              = "${var.name_prefix}-private-${var.availability_zones[count.index]}"
      Tier                              = "private"
      "kubernetes.io/role/internal-elb" = "1"
    },
  )
}

# ---- Route tables ---------------------------------------------------------
# One shared public route table (default route → IGW, added in gateways.tf)
# and one private route table per AZ. Per-AZ private tables let us add
# AZ-local NAT Gateways later without re-plumbing the routes — for now all
# private route tables point to the single NAT in AZ[0] (see gateways.tf).

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-rt-public"
    Tier = "public"
  })
}

resource "aws_route_table" "private" {
  count = local.az_count

  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-rt-private-${var.availability_zones[count.index]}"
    Tier = "private"
  })
}

resource "aws_route_table_association" "public" {
  count = local.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count = local.az_count

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}
