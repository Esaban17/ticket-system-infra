# ---------------------------------------------------------------------------
# ingress module — input variables.
# ---------------------------------------------------------------------------

variable "namespace" {
  description = "Kubernetes namespace the application and its ingress live in."
  type        = string
  default     = "ticket-system"
}

variable "app_name" {
  description = "Name used for the Deployment, Service, ServiceAccount and Ingress objects."
  type        = string
  default     = "ticket-system-api"
}

variable "image" {
  description = "Container image repository URL (ECR) for the NestJS API, WITHOUT the tag."
  type        = string
}

variable "image_tag" {
  description = "Tag of the API container image to deploy (pushed to ECR by the build step)."
  type        = string
  default     = "d3"
}

variable "replicas" {
  description = "Number of API pod replicas."
  type        = number
  default     = 2
}

variable "app_port" {
  description = "Container port the NestJS API listens on (matches the security module's app_port and the Service targetPort)."
  type        = number
  default     = 8080
}

variable "health_check_path" {
  description = "HTTP path used by the ALB target group health check and the pod readiness/liveness probes (rubric: configurable health check path). Defaults to /healthz, which the NestJS API serves outside the /v1 prefix."
  type        = string
  default     = "/healthz"
}

variable "app_resource" {
  description = "URL path of the REST resource exposed by the API (GET/POST /<resource>). The NestJS global prefix is /v1, so the resource is reachable at /v1/tickets. The Ingress routes the root path to the service; this only documents the endpoint used in evidence."
  type        = string
  default     = "v1/tickets"
}

# ---- Cluster / IRSA -------------------------------------------------------

variable "cluster_name" {
  description = "EKS cluster name; used in the app IRSA role name."
  type        = string
}

variable "oidc_provider_arn" {
  description = "ARN of the cluster IAM OIDC provider, used to scope the app's IRSA trust policy to its ServiceAccount."
  type        = string
}

# ---- AWS resources the app talks to ---------------------------------------

variable "region" {
  description = "AWS region, injected into the pod env so the AWS SDK targets the right S3 endpoint."
  type        = string
}

variable "bucket_name" {
  description = "Name of the S3 bucket the POST endpoint writes objects to (from the storage module)."
  type        = string
}

variable "bucket_arn" {
  description = "ARN of the S3 bucket. The app IRSA policy is scoped to THIS bucket ARN only — no wildcard resource."
  type        = string
}

variable "db_endpoint" {
  description = "RDS endpoint in host:port form (from the database module)."
  type        = string
}

variable "db_name" {
  description = "Initial database name on the RDS instance."
  type        = string
}

variable "db_username" {
  description = "Master username for the RDS instance (not a secret)."
  type        = string
}

# ---- Delivery 5 — Deliverable B: Secrets Manager + KMS ----------------------
# The DB password is NO LONGER injected into a Kubernetes Secret in cleartext.
# Instead the runtime reads it from Secrets Manager (SECRET_ARN) and composes
# DATABASE_URL using DB_HOST/DB_PORT/DB_NAME from the non-sensitive ConfigMap.

variable "secret_arn" {
  description = "ARN of the Secrets Manager secret with the DB credentials (from module.secrets.secret_arn). Injected into the app/consumer/seed ConfigMap as SECRET_ARN; the API's secret-loader fetches {username,password} at startup. Empty ('') falls back to the legacy DATABASE_URL Secret."
  type        = string
  default     = ""
}

variable "kms_key_arn" {
  description = "ARN of the CMK (from module.kms.key_arn). Documents the key the pod must be able to kms:Decrypt to unwrap the secret ciphertext. Empty ('') = unset. NOTE: with the centralized IAM module (D5-A) the actual app IRSA kms:Decrypt statement lives in ./modules/iam (scoped to this key via module.iam.kms_key_arn); this variable is kept for compatibility/documentation. DB_HOST/DB_PORT are derived inside main.tf by splitting var.db_endpoint, so no separate db_host/db_port variable is needed."
  type        = string
  default     = ""
}

variable "web_security_group_id" {
  description = "ID of web-sg, attached to the ALB created by the Ingress via the alb.ingress.kubernetes.io/security-groups annotation."
  type        = string
}

variable "tags" {
  description = "Tags applied to the IAM resources created here."
  type        = map(string)
  default     = {}
}

# ---- Centralized IAM policies (Delivery 5 — Deliverable A) -----------------

variable "app_policy_arn" {
  description = "ARN of the app (producer/API) IAM policy, created by the centralized ./modules/iam module. Attached to the app IRSA role (S3 PutObject/GetObject/ListBucket on the attachments bucket + sqs:SendMessage on the async queue)."
  type        = string
}

variable "consumer_policy_arn" {
  description = "ARN of the consumer IAM policy, created by the centralized ./modules/iam module. Attached to the consumer IRSA role (sqs:ReceiveMessage/DeleteMessage/GetQueueAttributes + s3:PutObject). Only consumed when sqs_queue_arn is set."
  type        = string
  default     = ""
}

# ---- Web frontend (SPA) ----------------------------------------------------

variable "web_image" {
  description = "Container image repository URL (ECR) for the web frontend SPA, WITHOUT the tag."
  type        = string
}

variable "web_image_tag" {
  description = "Tag of the web frontend container image to deploy (pushed to ECR by the build step)."
  type        = string
  default     = "bootstrap"
}

variable "web_replicas" {
  description = "Number of web frontend pod replicas."
  type        = number
  default     = 1
}

# ---- Async consumer (Delivery 4 — Deliverable B) -----------------------------

variable "sqs_queue_arn" {
  description = "ARN of the SQS queue. Used to scope the consumer IRSA policy and to add sqs:SendMessage to the app (producer) IRSA policy. Leave empty ('') to disable consumer resources (backward-compatible)."
  type        = string
  default     = ""
}

variable "sqs_queue_url" {
  description = "URL of the SQS queue. Injected into the consumer Deployment as the SQS_QUEUE_URL environment variable."
  type        = string
  default     = ""
}

variable "consumer_sa_name" {
  description = "Name of the Kubernetes ServiceAccount for the async consumer Deployment. Must match the IRSA trust policy namespace_service_accounts entry."
  type        = string
  default     = "ticket-system-consumer"
}

variable "consumer_deployment_name" {
  description = "Name of the Kubernetes Deployment for the async consumer worker. KEDA's ScaledObject references this name."
  type        = string
  default     = "ticket-system-consumer"
}

variable "polling_batch_size" {
  description = "Maximum number of SQS messages the consumer retrieves per ReceiveMessage call. Passed to the consumer Deployment as POLLING_BATCH_SIZE."
  type        = number
  default     = 10
}

# ---- Notificaciones por email (EP-12 / BL-119) -----------------------------

variable "ses_from_address" {
  description = "Dirección verificada en SES usada como remitente de los correos de notificación de tickets (de module.ses.from_address). Se inyecta como SES_FROM_ADDRESS en el ConfigMap compartido por el app y el consumer; el DispatchService la usa como Source en SendEmail. Vacío ('') = el app conserva el comportamiento stub (solo loguea) y no se inyecta la clave."
  type        = string
  default     = ""
}

# ---- Auth / Cognito (EP-14) — fluyen al ConfigMap del API ------------------

variable "auth_provider" {
  description = "AUTH_PROVIDER del API (mock | cognito)."
  type        = string
  default     = "mock"
}

variable "cognito_user_pool_id" {
  description = "ID del User Pool de Cognito (vacío = sin Cognito)."
  type        = string
  default     = ""
}

variable "cognito_client_id" {
  description = "ID del App Client público del SPA."
  type        = string
  default     = ""
}

variable "cognito_hosted_ui_domain" {
  description = "Base URL del Hosted UI de Cognito."
  type        = string
  default     = ""
}

variable "cognito_redirect_uri" {
  description = "redirect_uri OAuth del SPA (debe coincidir con el App Client)."
  type        = string
  default     = ""
}

variable "cognito_logout_uri" {
  description = "URI de logout que el SPA pasa a Cognito."
  type        = string
  default     = ""
}

variable "cors_origins" {
  description = "Orígenes CORS permitidos por el API (CSV). El SPA del ALB es mismo-origen y no requiere CORS, pero el demo SSO corre el SPA en localhost (cross-origin al API del ALB), por eso se incluye localhost. Vacío = default del API (localhost:3000)."
  type        = string
  default     = ""
}

# ---- HTTPS (cert ACM en el ALB) -------------------------------------------

variable "enable_https" {
  description = "Si true, el ALB agrega listener 443 con el cert ACM y redirige 80→443."
  type        = bool
  default     = false
}

variable "acm_certificate_arn" {
  description = "ARN del cert ACM (validado) a adjuntar al listener 443. Solo se usa con enable_https=true."
  type        = string
  default     = ""
}
