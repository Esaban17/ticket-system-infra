# ---------------------------------------------------------------------------
# Database module — Amazon RDS for PostgreSQL.
#
# Rubric requirements (Delivery 2 — Database Module, RDS branch):
#   - Subnet group as a Terraform resource, ≥2 subnets in different AZs
#   - Parameter group associated with the instance
#   - multi_az variable defined (value may be false in dev)
#   - storage_encrypted = true
#   - Password sourced from sensitive variable — not in any committed file
#   - Security group restricting ingress to the DB port from the app tier
#     ONLY (no 0.0.0.0/0)
# ---------------------------------------------------------------------------

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# ---- Subnet group ---------------------------------------------------------

resource "aws_db_subnet_group" "this" {
  name        = "${local.name_prefix}-db-subnets"
  description = "Subnet group for the ticket-system Postgres instance (at least 2 AZs)."
  subnet_ids  = var.subnet_ids
}

# ---- Parameter group ------------------------------------------------------
# postgres16 family, with log_statement = "all" so audit trails are captured.

resource "aws_db_parameter_group" "this" {
  name        = "${local.name_prefix}-pg16"
  family      = "postgres16"
  description = "Custom parameter group for the ticket-system Postgres 16 instance."

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "500" # log queries slower than 500 ms
  }
}

# ---- Security group -------------------------------------------------------
# db-sg is owned by the security module (Deliverable B) so every tiered
# SG-to-SG rule lives in one place. Its only ingress is from app-sg on the
# Postgres port; it has no egress and no 0.0.0.0/0 ingress. It is attached to
# the instance via var.security_group_ids below.

# ---- RDS instance ---------------------------------------------------------

resource "aws_db_instance" "this" {
  identifier             = "${local.name_prefix}-pg"
  engine                 = "postgres"
  engine_version         = var.engine_version
  instance_class         = var.instance_class
  allocated_storage      = var.allocated_storage_gb
  storage_type           = "gp3"
  storage_encrypted      = true
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.this.name
  parameter_group_name   = aws_db_parameter_group.this.name
  vpc_security_group_ids = var.security_group_ids
  multi_az               = var.multi_az
  publicly_accessible    = false
  skip_final_snapshot    = var.environment != "prod"
  deletion_protection    = var.deletion_protection
  apply_immediately      = var.environment == "dev"
}
