# ---------------------------------------------------------------------------
# Cognito module — User Pool + Hosted UI (OAuth code flow) para SSO (EP-14).
#
# Provisiona el IdP corporativo: User Pool, App Client público (code flow),
# dominio Hosted UI, grupos = roles de la app y usuarios semilla para la demo.
# El backend intercambia el `code` por tokens y verifica el ID token vía JWKS.
# ---------------------------------------------------------------------------

variable "region" {
  description = "AWS region (para construir la URL del Hosted UI y el issuer JWKS)."
  type        = string
}

variable "name_prefix" {
  description = "Prefijo de nombres, p.ej. 'ticket-system-dev'."
  type        = string
}

variable "domain_prefix" {
  description = "Prefijo del dominio Hosted UI (globalmente único, minúsculas, sin espacios). Resulta en https://<prefix>.auth.<region>.amazoncognito.com."
  type        = string
}

variable "callback_urls" {
  description = "URLs de callback OAuth permitidas (deben coincidir EXACTO con el redirect_uri del SPA). Cognito exige HTTPS salvo http://localhost, por eso en dev el SPA se sirve en localhost para el flujo SSO."
  type        = list(string)
  default     = ["http://localhost:5173/auth/callback"]
}

variable "logout_urls" {
  description = "URLs de logout permitidas por Cognito."
  type        = list(string)
  default     = ["http://localhost:5173/login"]
}

variable "seed_users" {
  description = "Usuarios semilla para la demo: mapa email => rol (debe ser uno de reportante/agente/administrador). El email coincide con el seed de la BD para que el upsert por email mapee al usuario existente."
  type        = map(string)
  default = {
    "reportante@ticket-system.dev" = "reportante"
    "agente@ticket-system.dev"     = "agente"
    "admin@ticket-system.dev"      = "administrador"
  }
}

variable "seed_user_password" {
  description = "Contraseña permanente de los usuarios semilla (pool de demo). Debe cumplir la política: ≥8, mayúscula, minúscula, número y símbolo."
  type        = string
  default     = "TicketsDev#2026!"
  sensitive   = true
}
