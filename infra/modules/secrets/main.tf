# ---------------------------------------------------------------------------
# Secrets module — Secrets Manager secret holding the DB credentials.
#
# Delivery 5 — Deliverable B. Generates the database master password and stores
# it (alongside the username) in a Secrets Manager secret encrypted with the
# project CMK. The API/Lambda read it at runtime via IRSA and compose the
# DATABASE_URL.
#
# CYCLE-BREAKING DESIGN (secrets <-> database):
#   The naive design would put the RDS endpoint (host) inside the secret, but
#   the database also needs the password FROM this module — that is a cycle
#   (secrets -> database -> secrets). It is broken as follows:
#
#     1. The PASSWORD is generated HERE (random_password.db) and consumed by the
#        database module. secrets therefore does NOT depend on database.
#     2. The secret payload contains ONLY the sensitive pair {username,password}.
#        It deliberately does NOT include host/port/dbname.
#     3. host/port/dbname are NON-sensitive and travel through the app ConfigMap
#        (DB_HOST from module.database.endpoint, DB_PORT/DB_NAME from known
#        variables). The API's secret-loader combines the secret (user+pass)
#        with those env vars to build DATABASE_URL at startup.
#
#   This keeps the graph one-directional: kms -> secrets -> {iam, database,
#   ingress} with no back-edge from database into secrets.
# ---------------------------------------------------------------------------

# Generated master password. override_special excludes characters that would
# need URL-encoding when embedded in DATABASE_URL (no '/', ':', '@', '?', etc.).
resource "random_password" "db" {
  length           = 24
  special          = true
  override_special = "!#$%&*()-_=+[]{}"
}

locals {
  # Caller-provided password wins (e.g. importing an existing DB); otherwise use
  # the generated one. coalesce treats "" as present, so var default is null.
  db_password = coalesce(var.db_password, random_password.db.result)
}

resource "aws_secretsmanager_secret" "db" {
  name        = "${var.name_prefix}-db"
  description = "Database master credentials (username + password) for ${var.name_prefix}. Encrypted with the project CMK. host/port/dbname travel via the app ConfigMap, not this secret (see module docs)."
  kms_key_id  = var.kms_key_arn

  # 0 in dev so `terraform destroy` removes the secret immediately instead of
  # scheduling it for deletion (which would block re-creating the same name).
  recovery_window_in_days = var.recovery_window_in_days
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id

  # ONLY the sensitive pair. host/port/dbname are intentionally excluded to
  # break the secrets <-> database cycle (see module docs).
  secret_string = jsonencode({
    username = var.username
    password = local.db_password
  })
}
