# ---------------------------------------------------------------------------
# SES module — outputs (EP-12 / BL-119).
# ---------------------------------------------------------------------------

output "identity_arn" {
  description = "ARN de la identidad de email de SES. Lo consume module.iam para scopear el statement ses:SendEmail/SendRawEmail del IRSA del app/consumer a ESTA identidad (sin wildcards)."
  value       = aws_ses_email_identity.notification.arn
}

output "from_address" {
  description = "Dirección verificada que actúa como remitente (Source) de los correos. Se inyecta en el ConfigMap del app y del consumer como SES_FROM_ADDRESS. Es la misma dirección verificada por la identidad."
  value       = aws_ses_email_identity.notification.email
}
