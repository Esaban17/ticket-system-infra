# ---------------------------------------------------------------------------
# BL-108 — Internet Gateway, NAT Gateway, default routes.
#
# Cost / HA trade-off:
#   A single NAT Gateway is provisioned in the public subnet of the FIRST AZ
#   (us-east-1a by default). Every private route table points its default
#   route to that single NAT. This is intentionally NOT highly-available:
#   if AZ-a fails, private subnets in AZ-b lose egress.
#
#   Rationale: a NAT Gateway costs ~33 USD/month + processed-GB. Doubling it
#   for HA in a course project is ~50% of the platform's monthly bill for a
#   benefit we cannot exercise (we never simulate an AZ outage). When this
#   stack moves to production, swap `count = 1` for `count = local.az_count`
#   in aws_nat_gateway.this and update the route below to index by AZ.
# ---------------------------------------------------------------------------

# ---- Internet Gateway -----------------------------------------------------

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-igw"
  })
}

resource "aws_route" "public_default" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

# ---- NAT Gateway (single AZ on purpose — see header) ---------------------

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-nat-eip"
  })

  # Per AWS docs, an EIP used by a NAT Gateway must be created before the
  # IGW route exists or the NAT will get stuck in 'pending'.
  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-nat"
  })

  depends_on = [aws_internet_gateway.this]
}

# All private route tables share the same NAT. When/if we add a per-AZ NAT,
# change `aws_nat_gateway.this.id` to `aws_nat_gateway.this[count.index].id`.
resource "aws_route" "private_default" {
  count = local.az_count

  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this.id
}
