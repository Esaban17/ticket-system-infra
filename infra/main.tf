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

data "aws_caller_identity" "current" {}

locals {
  name_prefix      = "${var.project_name}-${var.environment}"
  eks_cluster_name = "${var.project_name}-${var.environment}-eks"

  # Worker Lambda name shared by module.compute (name) and module.iam
  # (function_name). module.iam composes the Lambda + log-group ARNs BY NAME to
  # break the iam <-> compute dependency cycle; deriving both from one local
  # keeps them in sync from a single edit (no repeated "worker" string literal).
  worker_name          = "worker"
  worker_function_name = "${var.project_name}-${var.environment}-${local.worker_name}"

  # Delivery 5 — Deliverable B: runtime execution role ARNs composed BY NAME so
  # the KMS key policy can grant them data-plane access WITHOUT referencing the
  # IAM/IRSA resources (those reference module.kms.key_arn — referencing them
  # back from kms would form a cycle). The names mirror exactly how the modules
  # build them:
  #   - Lambda exec role: "${function_name}-role" (module.iam aws_iam_role.lambda_exec,
  #     function_name = local.worker_function_name = "${project}-${env}-worker").
  #   - App IRSA role:    "${cluster_name}-app" (ingress/iam.tf module.app_irsa
  #     role_name = "${var.cluster_name}-app", cluster_name = local.eks_cluster_name).
  lambda_exec_role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.worker_function_name}-role"
  app_irsa_role_arn    = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.eks_cluster_name}-app"

  kms_allowed_role_arns = [
    local.lambda_exec_role_arn,
    local.app_irsa_role_arn,
  ]
}

# ---- KMS (Delivery 5 — Deliverable B) -------------------------------------
# Single customer-managed CMK encrypting S3 (SSE-KMS), RDS storage and the DB
# credentials secret. Declared FIRST so storage/database/secrets/iam can scope
# their encryption + kms:Decrypt to module.kms.key_arn. The key policy grants
# the runtime roles BY NAME (local.kms_allowed_role_arns) to avoid an
# iam <-> kms cycle (iam references module.kms.key_arn; kms must NOT reference iam).

module "kms" {
  source = "./modules/kms"

  name_prefix             = local.name_prefix
  deletion_window_in_days = var.kms_deletion_window_in_days
  allowed_role_arns       = local.kms_allowed_role_arns
}

# ---- Secrets (Delivery 5 — Deliverable B) ---------------------------------
# Secrets Manager secret with the DB credentials {username,password}, encrypted
# with the CMK. The PASSWORD is generated here and consumed by module.database,
# so secrets does NOT depend on database (cycle-free). host/port/dbname are
# non-sensitive and flow to the app via the ConfigMap, not this secret.

module "secrets" {
  source = "./modules/secrets"

  name_prefix             = local.name_prefix
  kms_key_arn             = module.kms.key_arn
  username                = var.db_username
  db_password             = var.db_password
  recovery_window_in_days = var.environment == "prod" ? 7 : 0
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

  # D5-B: SSE-KMS with the project CMK (replaces SSE-S3/AES256).
  kms_key_arn = module.kms.key_arn
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

# ---- IAM (Delivery 5 — Deliverable A: centralized IAM module) -------------
# Single home for the four project IAM roles + the app/consumer policies:
#   - lambda_exec  -> consumed by module.compute (execution_role_arn)
#   - scheduler    -> consumed by module.scheduler (scheduler_role_arn)
#   - app/consumer policies -> consumed by module.ingress IRSA roles
#   - ci_runner + GitHub OIDC provider -> re-exposed at the root (Deliverable C)
#
# Declared BEFORE compute/scheduler/ingress so its outputs are available to
# them. CYCLE NOTE: compute needs the execution role from iam, and iam needs
# the Lambda ARN for the scheduler policy. To break the cycle, iam composes the
# target Lambda ARN BY NAME (function_name) instead of reading
# module.compute.function_arn — so iam does NOT depend on compute.

module "iam" {
  source = "./modules/iam"

  name_prefix   = "${var.project_name}-${var.environment}"
  environment   = var.environment
  function_name = local.worker_function_name

  bucket_arn    = module.storage.bucket_arn
  sqs_queue_arn = module.async.queue_arn

  # D5-B: scope the app IRSA + Lambda exec data-plane grants to the EXACT secret
  # and CMK ARNs (secretsmanager:GetSecretValue + kms:Decrypt[/GenerateDataKey]).
  # These reference module.kms/module.secrets, which is why kms grants its
  # runtime roles BY NAME (no back-reference to iam) to stay cycle-free.
  secret_arn  = module.secrets.secret_arn
  kms_key_arn = module.kms.key_arn

  # EP-12 / BL-119: scope ses:SendEmail/SendRawEmail (app + consumer IRSA) a la
  # EXACTA identidad de email verificada (sin wildcard).
  ses_identity_arn = module.ses.identity_arn

  # target_lambda_arn left empty: iam composes it by name to avoid the
  # iam <-> compute dependency cycle.
}

# ---- Compute (Lambda report-generator) -------------------------------------
# The Lambda is reused from D2 but its handler is now the report-generator
# (index.py) that lists async objects in S3 and writes a daily summary.
# Invoked by the EventBridge Scheduler (module.scheduler) via the dedicated
# scheduler IAM role (centralized in module.iam, ADR 0013). S3 permissions are
# scoped to the specific bucket ARN (no wildcard resources).

module "compute" {
  source = "./modules/compute"

  environment     = var.environment
  project_name    = var.project_name
  name            = local.worker_name
  memory_size     = var.lambda_memory_size
  timeout_seconds = var.lambda_timeout_seconds
  vpc_id          = module.network.vpc_id
  subnet_ids      = module.network.private_subnet_ids

  # D5: execution role centralized in module.iam (no IAM in the compute module).
  execution_role_arn = module.iam.lambda_exec_role_arn

  # D4: pass bucket so the Lambda can list and write S3 objects.
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

  environment        = var.environment
  project_name       = var.project_name
  subnet_ids         = module.network.private_subnet_ids
  security_group_ids = [module.security.db_sg_id]
  instance_class     = var.db_instance_class
  multi_az           = var.db_multi_az
  db_username        = var.db_username
  # D5-B: the master password now comes from the secrets module (generated or
  # caller-provided) so RDS and the secret stay in sync — NOT from var.db_password
  # directly (that var is only an optional override into module.secrets).
  db_password         = module.secrets.password
  kms_key_arn         = module.kms.key_arn
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

# ---- Container Insights (Delivery 5 — Deliverable G, opcional) ------------
# Monitoring stack en EKS vía CloudWatch Container Insights: el CloudWatch agent
# (DaemonSet) publica métricas de pods/nodos y Fluent Bit envía los logs de los
# contenedores a CloudWatch Logs. Un único IRSA (CloudWatchAgentServerPolicy)
# autentica ambos DaemonSets. depends_on sobre eks + alb_controller fuerza que el
# cluster y el control-plane de Helm/IRSA existan antes de instalar los charts.

module "container_insights" {
  source = "./modules/container-insights"

  cluster_name      = module.eks.cluster_name
  oidc_provider_arn = module.eks.oidc_provider_arn
  region            = var.region

  cloudwatch_metrics_chart_version = var.cloudwatch_metrics_chart_version
  fluent_bit_chart_version         = var.fluent_bit_chart_version

  depends_on = [module.eks, module.alb_controller]
}

# ---- Async Messaging Module (Delivery 4 — Deliverable A) ------------------
# SQS main queue + DLQ. Standard queue (not FIFO) with a redrive policy that
# moves messages to the DLQ after max_receive_count failed delivery attempts.
# Wired into the ingress module (producer SQS URL + consumer IRSA) and the
# keda module (queue ARN for scaling metric). See ADR 0010.

# ---- SES (EP-12 / BL-119) -------------------------------------------------
# Identidad de email verificada para los correos de notificación de tickets
# (resuelto/comentado/asignado) que el sistema envía al reportante. Identidad de
# email (no de dominio) = sin DNS, válida para el modo sandbox de SES. La
# verificación del buzón es un paso manual fuera de Terraform.

module "ses" {
  source = "./modules/ses"

  notification_email = var.notification_email
}

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

  # D5: scheduler role centralized in module.iam (lambda:InvokeFunction only).
  scheduler_role_arn = module.iam.scheduler_role_arn
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

  # D5-B: the app reads the DB password from Secrets Manager at runtime (no
  # cleartext DATABASE_URL Secret). SECRET_ARN + DB_HOST/DB_PORT/DB_NAME flow to
  # the ConfigMap (DB_HOST/DB_PORT derived inside the module from db_endpoint).
  # kms_key_arn documents the key; the IRSA kms:Decrypt grant lives in module.iam.
  secret_arn  = module.secrets.secret_arn
  kms_key_arn = module.kms.key_arn

  # D4: wire the SQS queue into the app ConfigMap (SQS_QUEUE_URL) and IRSA.
  sqs_queue_arn = module.async.queue_arn
  sqs_queue_url = module.async.queue_url

  # EP-12 / BL-119: remitente verificado de SES inyectado en el ConfigMap
  # (SES_FROM_ADDRESS), consumido por el app y el consumer (DispatchService).
  ses_from_address = module.ses.from_address

  # D5: app/consumer IAM policies centralized in module.iam; attached to the
  # IRSA roles created here.
  app_policy_arn      = module.iam.app_policy_arn
  consumer_policy_arn = module.iam.consumer_policy_arn

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

# ---- Observability (Delivery 5 — Deliverable E) ---------------------------
# CloudWatch log groups + alarms (Lambda Errors, SQS DLQ depth) + a dashboard,
# all wired to an SNS alerts topic, plus a monthly AWS Budgets cost budget.
# Log groups are encrypted with the project CMK. The alarms reference the
# worker Lambda BY NAME (local.worker_function_name) and the DLQ name derived
# from module.async.dlq_arn (SQS ARN's last colon segment is the queue name),
# so this module does not add new cross-module dependency cycles.

module "observability" {
  source = "./modules/observability"

  name_prefix = local.name_prefix
  environment = var.environment
  region      = var.region
  kms_key_arn = module.kms.key_arn

  # Alerting + budget.
  alert_email        = var.alert_email
  monthly_budget_usd = var.monthly_budget_usd

  # Alarm targets.
  lambda_function_name = local.worker_function_name
  dlq_queue_name       = element(split(":", module.async.dlq_arn), length(split(":", module.async.dlq_arn)) - 1)

  # Alarm tuning (all from root variables — no hardcoded thresholds/periods).
  lambda_error_threshold   = var.lambda_error_threshold
  dlq_depth_threshold      = var.dlq_depth_threshold
  alarm_period_seconds     = var.alarm_period_seconds
  alarm_evaluation_periods = var.alarm_evaluation_periods

  # Dashboard dimensions. RDS identifier mirrors module.database
  # (${project}-${env}-pg); the ALB suffix is left to the module default until
  # the ingress module exposes the LoadBalancer ARN suffix.
  rds_instance_identifier = "${local.name_prefix}-pg"
}
