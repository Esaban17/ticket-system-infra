# ---------------------------------------------------------------------------
# Cognito User Pool + Hosted UI + grupos (roles) + usuarios semilla.
# ---------------------------------------------------------------------------

resource "aws_cognito_user_pool" "this" {
  name = "${var.name_prefix}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # La app crea los usuarios (seed); no hay self-signup abierto en este entorno.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }
}

# Dominio del Hosted UI (login alojado por Cognito).
resource "aws_cognito_user_pool_domain" "this" {
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

# App Client PÚBLICO (sin secret) para el SPA: authorization code flow.
# El backend hace el intercambio del code sin client_secret (cliente público).
resource "aws_cognito_user_pool_client" "this" {
  name         = "${var.name_prefix}-spa"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # Necesario para emitir/renovar tokens del code flow.
  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # No revela si un email existe (anti-enumeración).
  prevent_user_existence_errors = "ENABLED"
}

# Grupos del pool = roles de la app. El ID token trae cognito:groups, que el
# backend mapea a la columna `role` del usuario.
resource "aws_cognito_user_group" "roles" {
  for_each     = toset(["reportante", "agente", "administrador"])
  name         = each.value
  user_pool_id = aws_cognito_user_pool.this.id
}

# Usuarios semilla con contraseña permanente (pool de demo).
resource "aws_cognito_user" "seed" {
  for_each     = var.seed_users
  user_pool_id = aws_cognito_user_pool.this.id
  username     = each.key
  password     = var.seed_user_password

  attributes = {
    email          = each.key
    email_verified = "true"
  }

  # No reenviar invitaciones por correo (no hay SES configurado para esto).
  message_action = "SUPPRESS"
}

resource "aws_cognito_user_in_group" "seed" {
  for_each     = var.seed_users
  user_pool_id = aws_cognito_user_pool.this.id
  username     = aws_cognito_user.seed[each.key].username
  group_name   = aws_cognito_user_group.roles[each.value].name
}
