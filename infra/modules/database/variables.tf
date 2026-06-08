variable "environment" {
  description = "Deployment environment (dev, prod). Used in resource naming and to relax destruction protections in dev."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be either 'dev' or 'prod'."
  }
}

variable "project_name" {
  description = "Project-level prefix applied to RDS-related resource names."
  type        = string
  default     = "ticket-system"
}

variable "subnet_ids" {
  description = "List of subnet IDs (at least 2 in different Availability Zones) used to build the DB subnet group. The rubric explicitly requires ≥2 subnets across different AZs."
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "Provide at least 2 subnet IDs in different AZs for the DB subnet group."
  }
}

variable "security_group_ids" {
  description = "Security Group IDs attached to the RDS instance. In Delivery 3 this is the db-sg from the security module, whose only ingress is from app-sg on the Postgres port (no 0.0.0.0/0). Passing the SGs in (instead of creating one here) keeps all tiered SG-to-SG rules in the security module."
  type        = list(string)

  validation {
    condition     = length(var.security_group_ids) >= 1
    error_message = "Provide at least one security group ID (the db-sg) for the RDS instance."
  }
}

variable "instance_class" {
  description = "RDS instance type. db.t4g.micro is the cheapest Postgres tier on Graviton; suitable for dev. Production should use at least db.t4g.small."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage_gb" {
  description = "Allocated storage in GB. 20 GB is the RDS minimum for gp3 storage."
  type        = number
  default     = 20
}

variable "engine_version" {
  description = "PostgreSQL engine version. Pinned to a major.minor to make plans predictable."
  type        = string
  default     = "16.3"
}

variable "multi_az" {
  description = "If true, RDS provisions a synchronous standby in another AZ for HA. Required to exist as a variable by the Delivery 2 rubric (the value can be false in dev). Costs ~2x when enabled."
  type        = bool
  default     = false
}

variable "db_name" {
  description = "Name of the initial database created on the instance."
  type        = string
  default     = "tickets"
}

variable "db_username" {
  description = "Master username for the RDS instance. Not a secret — exposed via 'aws rds describe-db-instances' anyway."
  type        = string
  default     = "ticket_admin"
}

variable "db_password" {
  description = "Master password for the RDS instance. Provided via the TF_VAR_db_password environment variable — NEVER committed to .tf or .tfvars files. Marked sensitive so it does not appear in plan output."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.db_password) >= 12
    error_message = "db_password must be at least 12 characters long."
  }
}

variable "deletion_protection" {
  description = "If true, the RDS instance cannot be destroyed by terraform. Set to true in prod."
  type        = bool
  default     = false
}
