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

  environment          = var.environment
  bucket_name          = "${var.project_name}-${var.environment}-attachments-${var.tickets_bucket_suffix}"
  force_destroy        = var.environment != "prod"
  cors_allowed_origins = var.attachments_cors_allowed_origins
}

# ---- Cognito (IdP / SSO Hosted UI — EP-14) --------------------------------

module "cognito" {
  source = "./modules/cognito"

  region        = var.region
  name_prefix   = "${var.project_name}-${var.environment}"
  domain_prefix = "${var.project_name}-${var.environment}-${var.tickets_bucket_suffix}"

  callback_urls      = var.cognito_callback_urls
  logout_urls        = var.cognito_logout_urls
  seed_user_password = var.cognito_seed_user_password
}

# ---- TLS (cert ACM para el subdominio HTTPS) ------------------------------

module "tls" {
  source = "./modules/tls"

  domain_name       = var.app_domain
  enable_validation = var.enable_https
}

# ---- Compute (Lambda report-generator) -------------------------------------
# The Lambda is reused from D2 but its handler is now the report-generator
# (index.py) that lists async objects in S3 and writes a daily summary.
# Invoked by the EventBridge Scheduler (module.scheduler) via the dedicated
# scheduler IAM role (ADR 0013). S3 permissions are scoped to the specific
# bucket ARN (no wildcard resources).

module "compute" {
  source = "./modules/compute"

  environment     = var.environment
  project_name    = var.project_name
  name            = "worker"
  memory_size     = var.lambda_memory_size
  timeout_seconds = var.lambda_timeout_seconds
  vpc_id          = module.network.vpc_id
  subnet_ids      = module.network.private_subnet_ids

  # D4: pass bucket so the Lambda can list and write S3 objects.
  # enable_s3_access uses a static bool (not derived from module.storage)
  # to avoid "count depends on apply-time value" on cold-start applies.
  bucket_name      = module.storage.bucket_id
  bucket_arn       = module.storage.bucket_arn
  enable_s3_access = true
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
# create_repository = false in staging: ECR repo names have no environment
# segment, so staging reads the repo created by dev via a data source.

module "registry" {
  source = "./modules/registry"

  env               = var.environment
  name_prefix       = var.project_name
  repository_name   = "${var.project_name}-api"
  create_repository = var.create_ecr_repositories
}

# ---- Registry (ECR for the web frontend image) ---------------------------
# Segundo repositorio ECR para la imagen de la SPA (nginx + dist/ de Vite).
# El workflow web-deploy.yml hace push aquí con tag = short SHA antes del
# terraform apply -target=module.ingress -var web_image_tag=<sha>.

module "registry_web" {
  source = "./modules/registry"

  env               = var.environment
  name_prefix       = var.project_name
  repository_name   = "${var.project_name}-web"
  create_repository = var.create_ecr_repositories
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

# ---- Async Messaging Module (Delivery 4 — Deliverable A) ------------------
# SQS main queue + DLQ. Standard queue (not FIFO) with a redrive policy that
# moves messages to the DLQ after max_receive_count failed delivery attempts.
# Wired into the ingress module (producer SQS URL + consumer IRSA) and the
# keda module (queue ARN for scaling metric). See ADR 0010.

module "async" {
  source = "./modules/async"

  queue_name_prefix             = "${var.project_name}-${var.environment}-async"
  visibility_timeout_seconds    = var.sqs_visibility_timeout_seconds
  message_retention_seconds     = var.sqs_message_retention_seconds
  max_receive_count             = var.sqs_max_receive_count
  dlq_message_retention_seconds = var.sqs_dlq_retention_seconds
}

# ---- Scheduled Jobs (Delivery 4 — Deliverable C) --------------------------
# EventBridge Scheduler invokes the report-generator Lambda on a cron schedule.
# A dedicated scheduler IAM role with lambda:InvokeFunction scoped to the
# specific Lambda ARN — narrower than the Lambda's own execution role (ADR 0013).

module "scheduler" {
  source = "./modules/scheduler"

  name                = "${var.project_name}-${var.environment}-report-scheduler"
  schedule_expression = var.scheduler_expression
  target_lambda_arn   = module.compute.function_arn
  scheduler_timezone  = var.scheduler_timezone
}

# ---- Ingress + app (Deliverable C + D, extended in D4) --------------------
# Full app stack on EKS: ClusterIP Service behind an ALB Ingress, app IRSA for
# least-privilege S3+SQS access, consumer Deployment for async polling,
# ConfigMap (non-secret, includes SQS_QUEUE_URL) + Secret (DATABASE_URL),
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

  # D4: wire the SQS queue into the app ConfigMap (SQS_QUEUE_URL) and IRSA.
  sqs_queue_arn = module.async.queue_arn
  sqs_queue_url = module.async.queue_url

  # Consumer Deployment settings.
  polling_batch_size = var.consumer_polling_batch_size

  # EP-14: auth provider flag + Cognito Hosted UI config flowed into the app
  # ConfigMap so the SPA can start the SSO flow and the API can exchange the
  # code + verify the ID token (JWKS). auth_provider=mock keeps the password
  # fallback working; the SSO button enables whenever the cognito block is set.
  auth_provider            = var.auth_provider
  cognito_user_pool_id     = module.cognito.user_pool_id
  cognito_client_id        = module.cognito.client_id
  cognito_hosted_ui_domain = module.cognito.hosted_ui_domain
  cognito_redirect_uri     = var.cognito_redirect_uri
  cognito_logout_uri       = var.cognito_logout_uri
  cors_origins             = var.api_cors_origins

  # HTTPS en el ALB (fase 2): listener 443 con el cert ACM + redirect 80→443.
  enable_https        = var.enable_https
  acm_certificate_arn = module.tls.validated_certificate_arn

  depends_on = [module.alb_controller]
}

# ---- KEDA (Delivery 4 — Deliverable F, EKS Async Integration +25 pts) ----
# Installs KEDA into the cluster and creates a ScaledObject that auto-scales
# the consumer Deployment based on SQS queue depth. Uses the KEDA operator
# IRSA (sqs:GetQueueAttributes) with identityOwner=operator. See ADR 0011.

module "keda" {
  source = "./modules/keda"

  cluster_name      = local.eks_cluster_name
  oidc_provider_arn = module.eks.oidc_provider_arn

  keda_version = var.keda_version
  aws_region   = var.region
  queue_url    = module.async.queue_url
  queue_arn    = module.async.queue_arn
  namespace    = "ticket-system"

  min_replica_count    = var.keda_min_replica_count
  max_replica_count    = var.keda_max_replica_count
  queue_length_trigger = var.keda_queue_length_trigger

  # keda module applies AFTER the cluster and ingress (consumer Deployment) exist.
  depends_on = [module.ingress]
}
