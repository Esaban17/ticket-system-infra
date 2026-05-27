# ---------------------------------------------------------------------------
# Network module — BL-107 + BL-108 + BL-109.
#
# Provides a dedicated VPC for the ticket-system platform that replaces the
# default VPC placeholder used during Delivery 2. The module is a single unit
# of infrastructure so consumers wire it once and get:
#
#   * 1 VPC (10.20.0.0/16 by default), DNS hostnames + support enabled
#   * 2 AZs (us-east-1a / us-east-1b), 1 public /24 + 1 private /24 per AZ
#   * Subnet tags so the AWS Load Balancer Controller picks up:
#       - public  → kubernetes.io/role/elb            = 1
#       - private → kubernetes.io/role/internal-elb   = 1
#       - both    → kubernetes.io/cluster/<name>      = shared  (optional)
#   * 1 Internet Gateway and 1 NAT Gateway (single-AZ — see gateways.tf)
#   * Gateway VPC endpoint for S3 (attached to the private route tables)
#   * Interface VPC endpoints for ECR (api+dkr), Secrets Manager, CloudWatch
#     Logs and SQS, all in the private subnets, sharing a single SG that only
#     allows 443 from the VPC CIDR.
#
# Files in this module:
#   main.tf       — this header + locals
#   variables.tf  — inputs
#   vpc.tf        — VPC, subnets, route tables, IGW associations
#   gateways.tf   — Internet Gateway, EIP, NAT Gateway, NAT default routes
#   endpoints.tf  — S3 gateway endpoint + interface endpoints + SG
#   outputs.tf    — re-exposed identifiers consumed by the root module
# ---------------------------------------------------------------------------

locals {
  az_count = length(var.availability_zones)

  # Carve subnets out of the VPC CIDR deterministically:
  #   public  AZ index 0..N-1  → 10.20.0.0/24, 10.20.1.0/24, ...
  #   private AZ index 0..N-1  → 10.20.10.0/24, 10.20.11.0/24, ...
  # Offset of 10 between public and private leaves headroom to add a third
  # subnet tier (e.g. DB-only) later without renumbering.
  public_subnet_cidrs  = [for i in range(local.az_count) : cidrsubnet(var.vpc_cidr, 8, i)]
  private_subnet_cidrs = [for i in range(local.az_count) : cidrsubnet(var.vpc_cidr, 8, i + 10)]

  cluster_tag = var.cluster_name == "" ? {} : {
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }

  common_tags = merge(
    {
      Module      = "network"
      Environment = var.environment
    },
    var.tags,
  )
}
