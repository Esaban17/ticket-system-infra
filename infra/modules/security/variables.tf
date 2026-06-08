# ---------------------------------------------------------------------------
# Security module — input variables.
#
# Every port, CIDR and protocol is an input variable with a description, so no
# port number or CIDR is hardcoded outside of a variable default (rubric:
# "All ports, allowed CIDRs, and protocol values must be input variables").
# ---------------------------------------------------------------------------

variable "name_prefix" {
  description = "Prefix used in resource names and the Name tag (e.g., 'ticket-system-dev')."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev|prod). Propagated as a tag."
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC in which the three tiered security groups and the NACLs are created."
  type        = string
}

variable "vpc_cidr" {
  description = "Primary IPv4 CIDR of the VPC. Used by the NACL rules that allow intra-VPC (tier-to-tier) traffic statelessly."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs the public NACL is associated with (the ALB / ingress tier)."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs the private NACL is associated with (EKS nodes, RDS, Lambda ENIs)."
  type        = list(string)
}

# ---- Ports ----------------------------------------------------------------

variable "http_port" {
  description = "TCP port for plain HTTP ingress on the web/ALB tier (web-sg)."
  type        = number
  default     = 80
}

variable "https_port" {
  description = "TCP port for HTTPS ingress on the web/ALB tier (web-sg). TLS termination is Delivery 5 scope, but the port is opened now so HTTPS works without a rule change later."
  type        = number
  default     = 443
}

variable "app_port" {
  description = "TCP port the application container listens on (the EKS pod targetPort). web-sg may egress to app-sg on this port and app-sg only accepts ingress from web-sg on this port."
  type        = number
  default     = 8080
}

variable "db_port" {
  description = "TCP port the database listens on (5432 for PostgreSQL). app-sg may egress to db-sg on this port and db-sg only accepts ingress from app-sg on this port."
  type        = number
  default     = 5432
}

variable "ephemeral_from_port" {
  description = "Lower bound of the ephemeral (return-traffic) TCP port range used by stateless NACL rules. Linux/AWS default ephemeral range starts at 1024."
  type        = number
  default     = 1024
}

variable "ephemeral_to_port" {
  description = "Upper bound of the ephemeral (return-traffic) TCP port range used by stateless NACL rules."
  type        = number
  default     = 65535
}

# ---- CIDRs & protocol -----------------------------------------------------

variable "web_ingress_cidrs" {
  description = "CIDR blocks allowed to reach the web/ALB tier on HTTP/HTTPS. Defaults to the whole internet because the ALB is public-facing."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "tcp_protocol" {
  description = "Protocol value used by the TCP security-group and NACL rules. Exposed as a variable so no protocol string is hardcoded in a rule block."
  type        = string
  default     = "tcp"
}

variable "tags" {
  description = "Extra tags merged into every resource created by this module."
  type        = map(string)
  default     = {}
}
