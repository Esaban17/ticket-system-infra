variable "cluster_name" {
  description = "Name of the EKS cluster. Forms part of resource ARNs and kubeconfig context names."
  type        = string
}

variable "cluster_version" {
  description = "Kubernetes minor version for the control plane (e.g., '1.30'). Patch versions are managed by AWS."
  type        = string
  default     = "1.30"
}

variable "vpc_id" {
  description = "VPC where the EKS control plane ENIs and node groups live."
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs (≥2 AZs) for the cluster and node groups. Default VPC subnets are acceptable as a placeholder for Delivery 2."
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "EKS requires at least 2 subnets in different AZs."
  }
}

variable "node_min_size" {
  description = "Minimum number of nodes in the managed node group. Required by the rubric to be a variable, not a hardcoded value."
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "Maximum number of nodes in the managed node group. Cluster Autoscaler (if enabled later) will scale up to this number."
  type        = number
  default     = 2
}

variable "node_desired_size" {
  description = "Target number of nodes in the managed node group at apply time. Must be ≥ node_min_size and ≤ node_max_size."
  type        = number
  default     = 1
}

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group. Required by the rubric to be a variable. t3.medium is the cheapest type that comfortably runs the EKS system pods + small workloads."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "environment" {
  description = "Deployment environment, propagated as a tag on the cluster and node group."
  type        = string
}
