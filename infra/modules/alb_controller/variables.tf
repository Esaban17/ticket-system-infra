# ---------------------------------------------------------------------------
# alb_controller module — input variables.
# ---------------------------------------------------------------------------

variable "cluster_name" {
  description = "Name of the EKS cluster the controller manages. Passed to the chart as clusterName and used in the IRSA role name."
  type        = string
}

variable "oidc_provider_arn" {
  description = "ARN of the cluster's IAM OIDC provider (module.eks.oidc_provider_arn). Used to scope the controller's IRSA trust policy."
  type        = string
}

variable "region" {
  description = "AWS region the cluster runs in. Passed to the chart so the controller targets the correct regional endpoints."
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC the cluster runs in. Passed to the chart so the controller discovers subnets within the right VPC."
  type        = string
}

variable "service_account_name" {
  description = "Name of the Kubernetes ServiceAccount created for the controller in kube-system."
  type        = string
  default     = "aws-load-balancer-controller"
}

variable "chart_version" {
  description = "Version of the aws-load-balancer-controller Helm chart from https://aws.github.io/eks-charts."
  type        = string
  default     = "1.8.1"
}

variable "tags" {
  description = "Tags applied to the IRSA role."
  type        = map(string)
  default     = {}
}
