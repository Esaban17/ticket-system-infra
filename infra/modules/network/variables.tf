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
  description = "AZs to spread subnets across. One public + one private subnet are created per AZ, so the length of this list is BOTH the AZ count and the per-tier subnet count (rubric: AZ count and subnet count must be input variables)."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones are required (EKS and RDS multi-AZ both need ≥2)."
  }
}

variable "public_subnet_cidrs" {
  description = "Optional explicit CIDR blocks for the public subnets, one per AZ (rubric: subnet CIDR blocks must be input variables). Leave empty ([]) to derive them deterministically from vpc_cidr via cidrsubnet(). When set, length must equal the number of availability_zones."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.public_subnet_cidrs) == 0 || alltrue([for c in var.public_subnet_cidrs : can(cidrhost(c, 0))])
    error_message = "Every entry in public_subnet_cidrs must be a valid IPv4 CIDR."
  }
}

variable "private_subnet_cidrs" {
  description = "Optional explicit CIDR blocks for the private subnets, one per AZ (rubric: subnet CIDR blocks must be input variables). Leave empty ([]) to derive them deterministically from vpc_cidr via cidrsubnet(). When set, length must equal the number of availability_zones."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.private_subnet_cidrs) == 0 || alltrue([for c in var.private_subnet_cidrs : can(cidrhost(c, 0))])
    error_message = "Every entry in private_subnet_cidrs must be a valid IPv4 CIDR."
  }
}

variable "single_nat_gateway" {
  description = "NAT topology toggle (rubric: single-NAT vs per-AZ NAT must be configurable via a variable). true = one shared NAT Gateway in the first public subnet (cheaper, no AZ-level HA for egress). false = one NAT Gateway per AZ (highly available, ~one NAT bill per AZ)."
  type        = bool
  default     = true
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
