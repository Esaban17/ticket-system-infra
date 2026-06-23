output "user_pool_id" {
  description = "ID del User Pool (lo usa el backend para verificar el ID token vía JWKS)."
  value       = aws_cognito_user_pool.this.id
}

output "client_id" {
  description = "ID del App Client público del SPA."
  value       = aws_cognito_user_pool_client.this.id
}

output "hosted_ui_domain" {
  description = "Base URL del Hosted UI (authorize/login/oauth2/token cuelgan de aquí)."
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${var.region}.amazoncognito.com"
}

output "issuer" {
  description = "Issuer del pool (base del JWKS: <issuer>/.well-known/jwks.json)."
  value       = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}
