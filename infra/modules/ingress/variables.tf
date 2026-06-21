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

variable "db_password" {
  description = "Master password for the RDS instance. Flows in from the TF_VAR_db_password chain and is written into a Kubernetes Secret (never a ConfigMap, never committed)."
  type        = string
  sensitive   = true
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
