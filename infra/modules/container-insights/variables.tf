# ---------------------------------------------------------------------------
# container-insights module — input variables.
# ---------------------------------------------------------------------------

variable "cluster_name" {
  description = "Name of the EKS cluster monitored by Container Insights. Passed to the charts as clusterName and used in the IRSA role name and the log group path."
  type        = string
}

variable "oidc_provider_arn" {
  description = "ARN of the cluster's IAM OIDC provider (module.eks.oidc_provider_arn). Used to scope the CloudWatch agent IRSA trust policy to the amazon-cloudwatch:cloudwatch-agent service account."
  type        = string
}

variable "region" {
  description = "AWS region the cluster runs in. Passed to Fluent Bit so it writes to CloudWatch Logs in the correct regional endpoint."
  type        = string
}

variable "namespace" {
  description = "Kubernetes namespace for the CloudWatch agent and Fluent Bit DaemonSets. Convention for Container Insights is amazon-cloudwatch."
  type        = string
  default     = "amazon-cloudwatch"
}

variable "service_account_name" {
  description = "Name of the Kubernetes ServiceAccount created for the CloudWatch agent (and reused by Fluent Bit). Annotated with the IRSA role ARN."
  type        = string
  default     = "cloudwatch-agent"
}

variable "cloudwatch_metrics_chart_version" {
  description = "Version of the aws-cloudwatch-metrics Helm chart from https://aws.github.io/eks-charts. Pin to avoid unexpected behavior changes from auto-upgrades."
  type        = string
  default     = "0.0.11"
}

variable "fluent_bit_chart_version" {
  description = "Version of the aws-for-fluent-bit Helm chart from https://aws.github.io/eks-charts. Pin to avoid unexpected behavior changes from auto-upgrades."
  type        = string
  default     = "0.1.34"
}

variable "tags" {
  description = "Tags applied to the IRSA role."
  type        = map(string)
  default     = {}
}
