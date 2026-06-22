variable "environment" {
  description = "Deployment environment. Controls naming, sizing, and retention policies across all resources."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be 'dev', 'staging', or 'prod'."
  }
}

variable "project_name" {
  description = "Name of the project. Used as a prefix in all resource names to avoid collisions across projects in the same AWS account."
  type        = string
  default     = "ticket-system"
}

variable "region" {
  description = "AWS region where all resources will be provisioned. Choose a region close to your primary user base."
  type        = string
  default     = "us-east-1"
}

# ---- Network -------------------------------------------------------------

variable "vpc_cidr" {
  description = "Primary IPv4 CIDR for the dedicated VPC provisioned by the network module."
  type        = string
  default     = "10.20.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones across which public and private subnets are spread. Two AZs is the minimum supported by RDS multi-AZ and EKS."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "tickets_bucket_suffix" {
  description = "Suffix appended to the S3 bucket name for ticket attachments and reports. Must be globally unique across all AWS accounts. Use a short random string or your team identifier."
  type        = string
  default     = "galileo-pdds"
}

# ---- Application / ingress ports ------------------------------------------

variable "app_port" {
  description = "TCP port the application container (NestJS API) listens on inside the pod. Drives the web-sg→app-sg→pod path and the Ingress target port. No port number is hardcoded in the security or ingress modules — they read this."
  type        = number
  default     = 8080
}

variable "db_port" {
  description = "TCP port PostgreSQL listens on. Drives the app-sg→db-sg rule and the RDS connection string."
  type        = number
  default     = 5432
}

variable "health_check_path" {
  description = "HTTP path the ALB target group uses for health checks against the app pods (rubric: configurable health check path). The NestJS API exposes '/healthz' outside the /v1 prefix."
  type        = string
  default     = "/healthz"
}

# ---- Compute (Lambda) ----------------------------------------------------

variable "lambda_memory_size" {
  description = "Memory (MB) allocated to the async worker Lambda."
  type        = number
  default     = 128
}

variable "lambda_timeout_seconds" {
  description = "Maximum execution time (seconds) for a single invocation of the async worker Lambda."
  type        = number
  default     = 30
}

# ---- Database (RDS PostgreSQL) -------------------------------------------

variable "db_instance_class" {
  description = "RDS instance class for the Postgres instance."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_multi_az" {
  description = "If true, RDS provisions a synchronous standby in another AZ. False in dev for cost reasons."
  type        = bool
  default     = false
}

variable "db_username" {
  description = "Master username for the RDS instance and the username embedded in the app's DATABASE_URL. Not a secret (visible via the RDS API). Kept as a variable so the database module and the ingress module use the same value."
  type        = string
  default     = "ticket_admin"
}

variable "db_password" {
  description = "Master password for the RDS instance. MUST be provided via the TF_VAR_db_password environment variable — never via .tfvars or .tf files committed to git."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.db_password) >= 12
    error_message = "db_password must be at least 12 characters long."
  }
}

# ---- ECR (container registries) ------------------------------------------

variable "create_ecr_repositories" {
  description = "When true (default), create and manage the ECR repositories for the API and web images. Set to false in staging: ECR repository names have no environment segment, so staging reuses the repos created by dev and reads them via data sources instead of recreating them."
  type        = bool
  default     = true
}

variable "api_image_tag" {
  description = "Tag of the ticket-system API container image (in ECR) deployed to EKS. The build step pushes this tag before the ingress module is applied."
  type        = string
  default     = "d3"
}

variable "web_image_tag" {
  description = "Tag of the ticket-system web frontend container image (in ECR) deployed to EKS. The web-deploy.yml workflow pushes this tag before the ingress module is applied."
  type        = string
  default     = "bootstrap"
}

# ---- EKS (Optional Track 1) ----------------------------------------------

variable "eks_cluster_version" {
  description = "Kubernetes minor version for the EKS control plane."
  type        = string
  default     = "1.30"
}

variable "eks_node_instance_types" {
  description = "EC2 instance types used by the EKS managed node group."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "eks_node_desired_size" {
  description = "Target node count for the EKS managed node group at apply time."
  type        = number
  default     = 1
}

variable "eks_node_min_size" {
  description = "Lower bound for the EKS managed node group."
  type        = number
  default     = 1
}

variable "eks_node_max_size" {
  description = "Upper bound for the EKS managed node group."
  type        = number
  default     = 2
}

# ---- Async messaging (SQS) — Delivery 4, Deliverable A ----------------------

variable "sqs_max_receive_count" {
  description = "Number of times a message can be received from the SQS queue before being moved to the DLQ. 3 attempts provides two retries before dead-lettering."
  type        = number
  default     = 3
}

variable "sqs_visibility_timeout_seconds" {
  description = "Seconds a received SQS message remains invisible to other consumers. Must exceed the consumer's maximum processing time to avoid duplicate delivery."
  type        = number
  default     = 60
}

variable "sqs_message_retention_seconds" {
  description = "Seconds SQS retains messages in the main queue before discarding them."
  type        = number
  default     = 345600
}

variable "sqs_dlq_retention_seconds" {
  description = "Seconds SQS retains dead-lettered messages. 14 days gives operators time to inspect and replay failed messages."
  type        = number
  default     = 1209600
}

variable "consumer_polling_batch_size" {
  description = "Maximum number of messages the consumer worker retrieves per SQS ReceiveMessage call. Drives the POLLING_BATCH_SIZE env var in the consumer Deployment."
  type        = number
  default     = 10
}

# ---- KEDA (EKS autoscaling) — Delivery 4, Deliverable F --------------------

variable "keda_version" {
  description = "Version of the KEDA Helm chart to install in the EKS cluster. Pin this to avoid unexpected behavior changes from auto-upgrades."
  type        = string
  default     = "2.15.1"
}

variable "keda_min_replica_count" {
  description = "Minimum number of consumer pod replicas KEDA will maintain. 0 allows full scale-down when the queue is empty (cost optimization)."
  type        = number
  default     = 0
}

variable "keda_max_replica_count" {
  description = "Maximum number of consumer pod replicas KEDA will scale up to."
  type        = number
  default     = 5
}

variable "keda_queue_length_trigger" {
  description = "Target number of SQS messages per consumer pod replica. KEDA computes desired_replicas = queue_depth / queue_length_trigger."
  type        = number
  default     = 5
}

# ---- EventBridge Scheduler — Delivery 4, Deliverable C ---------------------

variable "scheduler_expression" {
  description = "Rate or cron expression for the EventBridge Scheduler that invokes the report-generator Lambda (e.g. 'rate(1 day)')."
  type        = string
  default     = "rate(1 day)"
}

variable "scheduler_timezone" {
  description = "IANA timezone for the EventBridge Scheduler schedule expression."
  type        = string
  default     = "UTC"
}
