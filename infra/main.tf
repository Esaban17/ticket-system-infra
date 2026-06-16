# ---------------------------------------------------------------------------
# Root module — wires together network, compute, storage, database, and EKS.
#
# Delivery 3 (BL-107..BL-110) replaced the Delivery 2 placeholder (default VPC
# + default subnets) with a dedicated VPC provisioned by the ./modules/network
# module: 10.20.0.0/16, 2 AZs, 1 public /24 + 1 private /24 per AZ, single
# NAT, IGW and 5 VPC endpoints (S3 gateway + ECR/Secrets Manager/Logs/SQS
# interface).
#
# Subnet placement:
#   - RDS         → private subnets (no public access)
#   - Lambda ENIs → private subnets (egress through NAT and VPC endpoints)
#   - EKS         → control plane and nodes get BOTH public and private
#                   subnets. Public ones carry kubernetes.io/role/elb=1 so
#                   the AWS Load Balancer Controller can place internet
#                   facing ALBs; node groups should be pinned to private
#                   subnets via subnet tags / nodegroup config later.
# ---------------------------------------------------------------------------

locals {
  eks_cluster_name = "${var.project_name}-${var.environment}-eks"
}

# ---- Network --------------------------------------------------------------

module "network" {
  source = "./modules/network"

  name_prefix        = "${var.project_name}-${var.environment}"
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  cluster_name       = local.eks_cluster_name
}

# ---- Security (Deliverable B — tiered SGs + NACLs) ------------------------
# web-sg → app-sg → db-sg. web-sg is attached to the ALB by the ingress
# module, app-sg to the EKS node group, db-sg to the RDS instance. NACLs are
# associated with the public and private subnets from the network module.

module "security" {
  source = "./modules/security"

  name_prefix        = "${var.project_name}-${var.environment}"
  environment        = var.environment
  vpc_id             = module.network.vpc_id
  vpc_cidr           = module.network.vpc_cidr
  public_subnet_ids  = module.network.public_subnet_ids
  private_subnet_ids = module.network.private_subnet_ids
  app_port           = var.app_port
  db_port            = var.db_port
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
  vpc_id          = module.network.vpc_id
  subnet_ids      = module.network.private_subnet_ids
}

# ---- Database (RDS PostgreSQL) -------------------------------------------
# RDS sits in the private subnets and is attached to db-sg from the security
# module, whose only ingress is from app-sg (the EKS node tier) on port 5432.
# This is the SG-to-SG wiring required by Deliverable B.

module "database" {
  source = "./modules/database"

  environment         = var.environment
  project_name        = var.project_name
  subnet_ids          = module.network.private_subnet_ids
  security_group_ids  = [module.security.db_sg_id]
  instance_class      = var.db_instance_class
  multi_az            = var.db_multi_az
  db_username         = var.db_username
  db_password         = var.db_password
  deletion_protection = var.environment == "prod"
}

# ---- Registry (ECR for the API container image) --------------------------
# Provisioned ahead of BL-102 (Dockerfile + initial push) so the image URL
# is available as a stable terraform output before any container work begins.

module "registry" {
  source = "./modules/registry"

  env             = var.environment
  name_prefix     = var.project_name
  repository_name = "${var.project_name}-api"
}

# ---- Registry (ECR for the web frontend image) ---------------------------
# Segundo repositorio ECR para la imagen de la SPA (nginx + dist/ de Vite).
# El workflow web-deploy.yml hace push aquí con tag = short SHA antes del
# terraform apply -target=module.ingress -var web_image_tag=<sha>.

module "registry_web" {
  source = "./modules/registry"

  env             = var.environment
  name_prefix     = var.project_name
  repository_name = "${var.project_name}-web"
}

# ---- EKS (Optional Track 1 + Deliverable F) ------------------------------
# Deliverable F: the cluster consumes the D3 network module's VPC + subnet
# outputs (no placeholder VPC). Managed node groups are pinned to the PRIVATE
# subnets (no public IPs); public subnets are advertised only so the AWS Load
# Balancer Controller can place internet-facing ALBs. app-sg from the security
# module is attached to the node group so pods inherit the app→db path and the
# web→app ingress path. endpoint_private_access is enabled in the module.

module "eks" {
  source = "./modules/eks"

  cluster_name            = local.eks_cluster_name
  cluster_version         = var.eks_cluster_version
  vpc_id                  = module.network.vpc_id
  subnet_ids              = module.network.private_subnet_ids
  public_subnet_ids       = module.network.public_subnet_ids
  node_security_group_ids = [module.security.app_sg_id]
  node_min_size           = var.eks_node_min_size
  node_max_size           = var.eks_node_max_size
  node_desired_size       = var.eks_node_desired_size
  node_instance_types     = var.eks_node_instance_types
  environment             = var.environment
}

# ---- ALB Controller (Deliverable C prerequisite) -------------------------
# Helm release + IRSA so the controller can turn the kubernetes_ingress_v1
# below into an internet-facing ALB.

module "alb_controller" {
  source = "./modules/alb_controller"

  cluster_name      = module.eks.cluster_name
  oidc_provider_arn = module.eks.oidc_provider_arn
  region            = var.region
  vpc_id            = module.network.vpc_id

  # Las referencias a outputs solo crean dependencia sobre el cluster/OIDC, NO
  # sobre el node group. En destroy, Terraform tumbaba los nodos en paralelo y
  # mataba los pods del controller mientras el Ingress esperaba a que ese mismo
  # controller procesara su finalizer y borrara el ALB (deadlock del teardown
  # del 2026-06-10). depends_on al módulo completo fuerza el orden correcto:
  # ingress → controller → nodos. module.network se suma porque el controller
  # necesita salida a los APIs de EC2/ELB (sin VPC endpoint aquí) para borrar
  # el ALB: si el NAT cae en paralelo, la eliminación muere por i/o timeout
  # (segundo teardown del 2026-06-10).
  depends_on = [module.eks, module.network]
}

# ---- Ingress + app (Deliverable C + D) -----------------------------------
# Full app stack on EKS: ClusterIP Service behind an ALB Ingress, app IRSA for
# least-privilege S3 access, ConfigMap (non-secret) + Secret (DATABASE_URL),
# and a one-shot seed Job. depends_on ensures the controller is running first.

module "ingress" {
  source = "./modules/ingress"

  cluster_name      = local.eks_cluster_name
  oidc_provider_arn = module.eks.oidc_provider_arn
  region            = var.region

  image     = module.registry.ecr_repository_url
  image_tag = var.api_image_tag
  app_port  = var.app_port

  web_image     = module.registry_web.ecr_repository_url
  web_image_tag = var.web_image_tag

  health_check_path     = var.health_check_path
  web_security_group_id = module.security.web_sg_id

  bucket_name = module.storage.bucket_id
  bucket_arn  = module.storage.bucket_arn

  db_endpoint = module.database.endpoint
  db_name     = module.database.db_name
  db_username = var.db_username
  db_password = var.db_password

  depends_on = [module.alb_controller]
}
