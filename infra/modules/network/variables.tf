# ---------------------------------------------------------------------------
# Network module — input variables.
# ---------------------------------------------------------------------------

variable "name_prefix" {
  description = "Prefix used in resource names and the Name tag (e.g., 'ticket-system-dev')."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev|prod). Propagated as a tag."
  type        = string
}

variable "vpc_cidr" {
  description = "Primary IPv4 CIDR for the VPC. /16 leaves plenty of room for /24 subnets per AZ."
  type        = string
  default     = "10.20.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid IPv4 CIDR (e.g., 10.20.0.0/16)."
  }
}

variable "availability_zones" {
  description = "AZs to spread subnets across. One public /24 + one private /24 are created per AZ."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones are required (EKS and RDS multi-AZ both need ≥2)."
  }
}

variable "cluster_name" {
  description = "EKS cluster name used to tag subnets with kubernetes.io/cluster/<name>=shared so the AWS Load Balancer Controller and cluster-autoscaler can discover them. Empty string disables the tag."
  type        = string
  default     = ""
}

variable "interface_endpoint_services" {
  description = "AWS service names (without the com.amazonaws.<region>. prefix) to expose as interface VPC endpoints in the private subnets."
  type        = list(string)
  default = [
    "ecr.api",
    "ecr.dkr",
    "secretsmanager",
    "logs",
    "sqs",
  ]
}

variable "tags" {
  description = "Extra tags merged into every resource created by this module."
  type        = map(string)
  default     = {}
}
