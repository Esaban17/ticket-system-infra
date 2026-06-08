# ---------------------------------------------------------------------------
# BL-108 — Internet Gateway, NAT Gateway, default routes.
#
# Cost / HA trade-off (now controlled by var.single_nat_gateway):
#   single_nat_gateway = true  → one shared NAT Gateway in the public subnet of
#     the FIRST AZ. Every private route table points its default route to it.
#     Cheaper (~33 USD/month) but NOT highly-available: if AZ-a fails, private
#     subnets in other AZs lose egress.
#   single_nat_gateway = false → one NAT Gateway per AZ, each in that AZ's
#     public subnet; each private route table points to its AZ-local NAT.
#     Highly available, ~one NAT bill per AZ.
#
#   local.nat_count (main.tf) resolves the toggle to 1 or az_count; the route
#   below indexes the NAT by AZ when per-AZ, or pins to NAT[0] when shared.
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
  count  = local.nat_count
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-nat-eip-${count.index}"
  })

  # Per AWS docs, an EIP used by a NAT Gateway must be created before the
  # IGW route exists or the NAT will get stuck in 'pending'.
  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  count = local.nat_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-nat-${count.index}"
  })

  depends_on = [aws_internet_gateway.this]
}

# Each private route table sends its default route to a NAT Gateway. With a
# single shared NAT every table points to NAT[0]; with per-AZ NAT each table
# points to the NAT in its own AZ (min() clamps the index for the shared case).
resource "aws_route" "private_default" {
  count = local.az_count

  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[min(count.index, local.nat_count - 1)].id
}
