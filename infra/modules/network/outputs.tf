# ---------------------------------------------------------------------------
# Network module — outputs consumed by the root module and downstream
# modules (compute, database, eks).
# ---------------------------------------------------------------------------

output "vpc_id" {
  description = "ID of the VPC. Consumed by every module that creates an SG."
  value       = aws_vpc.this.id
}

output "vpc_cidr" {
  description = "Primary IPv4 CIDR of the VPC. Used for SG rules that need to scope ingress to in-VPC traffic only."
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of the public subnets (one per AZ). Used for internet-facing load balancers (ALB) and the NAT Gateway."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets (one per AZ). Used for application workloads, EKS nodes, RDS, Lambda ENIs."
  value       = aws_subnet.private[*].id
}

output "nat_gateway_id" {
  description = "ID of the single NAT Gateway. Exposed for observability/inspection — note that NAT HA is intentionally not provided (see gateways.tf header)."
  value       = aws_nat_gateway.this.id
}

output "nat_eip" {
  description = "Elastic IP address allocated to the NAT Gateway. Useful when egress traffic needs to be allow-listed by external services."
  value       = aws_eip.nat.public_ip
}

output "vpc_endpoint_sg_id" {
  description = "Security group ID shared by all interface VPC endpoints. Consumers do not normally need this — endpoints accept any TLS traffic from inside the VPC CIDR — but it is exposed for diagnostics and future tightening."
  value       = aws_security_group.vpc_endpoints.id
}
