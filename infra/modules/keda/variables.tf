# ---------------------------------------------------------------------------
# keda module — input variables (Delivery 4, Deliverable F).
# ---------------------------------------------------------------------------

variable "cluster_name" {
  description = "EKS cluster name. Used in the KEDA IRSA role name to make it unique across multiple clusters in the same account."
  type        = string
}

variable "oidc_provider_arn" {
  description = "ARN of the EKS cluster's IAM OIDC provider. Required to scope the KEDA operator IRSA trust policy to the keda-operator ServiceAccount."
  type        = string
}

variable "keda_version" {
  description = "Version of the KEDA Helm chart to install (e.g. '2.15.1'). Pin this to avoid unexpected behavior changes from auto-upgrades."
  type        = string
  default     = "2.15.1"
}

variable "aws_region" {
  description = "AWS region where the SQS queue lives. Passed to the KEDA SQS trigger so the scaler can call the correct regional endpoint."
  type        = string
}

variable "queue_url" {
  description = "URL of the SQS queue to monitor. Passed to the KEDA ScaledObject trigger (queueURL). Must match the SQS_QUEUE_URL env var in the consumer Deployment to avoid targeting the wrong queue."
  type        = string
}

variable "queue_arn" {
  description = "ARN of the SQS queue. Used to scope the KEDA operator IRSA policy to sqs:GetQueueAttributes on this SPECIFIC queue — no wildcard."
  type        = string
}

variable "namespace" {
  description = "Kubernetes namespace where the consumer Deployment (and ScaledObject) live."
  type        = string
  default     = "ticket-system"
}

variable "consumer_deployment_name" {
  description = "Name of the Kubernetes Deployment KEDA will scale. The ScaledObject's scaleTargetRef points to this name."
  type        = string
  default     = "ticket-system-consumer"
}

variable "min_replica_count" {
  description = "Minimum number of consumer pod replicas KEDA will maintain. Set to 0 to allow complete scale-down when the queue is empty (cost optimization)."
  type        = number
  default     = 0
}

variable "max_replica_count" {
  description = "Maximum number of consumer pod replicas KEDA will scale up to."
  type        = number
  default     = 5
}

variable "queue_length_trigger" {
  description = "Target number of SQS messages per consumer pod replica. KEDA uses this as the scaling threshold: desired_replicas = queue_depth / queue_length_trigger."
  type        = number
  default     = 5
}
