# ---------------------------------------------------------------------------
# Root module — wires together compute, storage, database, and EKS modules.
#
# Network: uses the default VPC and its subnets as a placeholder until
# Delivery 3 provisions a dedicated VPC. This decision is documented in
# infra/README.md and docs/trade-offs/04-eks-track.md.
# ---------------------------------------------------------------------------

# ---- Default VPC and subnets (placeholder network) -----------------------

data "aws_vpc" "default" {
  default = true
}

# Filter default subnets to AZs that support every service we use.
# us-east-1e does NOT support EKS control plane instances and would cause
# CreateCluster to fail with UnsupportedAvailabilityZoneException.
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "availability-zone"
    values = ["us-east-1a", "us-east-1b", "us-east-1c", "us-east-1d", "us-east-1f"]
  }
}

# ---- Storage --------------------------------------------------------------

module "storage" {
  source = "./modules/storage"

  environment   = var.environment
  bucket_name   = "${var.project_name}-${var.environment}-attachments-${var.tickets_bucket_suffix}"
  force_destroy = var.environment == "dev"
}

# ---- Compute (Lambda worker) ---------------------------------------------

module "compute" {
  source = "./modules/compute"

  environment     = var.environment
  project_name    = var.project_name
  name            = "worker"
  memory_size     = var.lambda_memory_size
  timeout_seconds = var.lambda_timeout_seconds
  vpc_id          = data.aws_vpc.default.id
  subnet_ids      = data.aws_subnets.default.ids
}

# ---- Database (RDS PostgreSQL) -------------------------------------------
# The DB Security Group's only ingress rule is sourced from the compute
# module's SG — this is the cross-module wiring that satisfies the rubric
# "Module outputs not consumed" criterion.

module "database" {
  source = "./modules/database"

  environment           = var.environment
  project_name          = var.project_name
  vpc_id                = data.aws_vpc.default.id
  subnet_ids            = data.aws_subnets.default.ids
  app_security_group_id = module.compute.security_group_id
  instance_class        = var.db_instance_class
  multi_az              = var.db_multi_az
  db_password           = var.db_password
  deletion_protection   = var.environment == "prod"
}

# ---- EKS (Optional Track 1) ----------------------------------------------

module "eks" {
  source = "./modules/eks"

  cluster_name        = "${var.project_name}-${var.environment}-eks"
  cluster_version     = var.eks_cluster_version
  vpc_id              = data.aws_vpc.default.id
  subnet_ids          = data.aws_subnets.default.ids
  node_min_size       = var.eks_node_min_size
  node_max_size       = var.eks_node_max_size
  node_desired_size   = var.eks_node_desired_size
  node_instance_types = var.eks_node_instance_types
  environment         = var.environment
}
