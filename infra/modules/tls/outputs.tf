output "certificate_arn" {
  description = "ARN del certificado ACM (puede estar PENDING_VALIDATION en la fase 1)."
  value       = aws_acm_certificate.this.arn
}

output "validated_certificate_arn" {
  description = "ARN listo para adjuntar al ALB. Con enable_validation depende del recurso de validación (espera ISSUED); si no, devuelve el ARN del cert."
  value       = var.enable_validation ? aws_acm_certificate_validation.this[0].certificate_arn : aws_acm_certificate.this.arn
}

output "domain_validation_options" {
  description = "Registros CNAME que el usuario debe crear en Hostinger para validar el cert (name/type/value)."
  value = [
    for o in aws_acm_certificate.this.domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ]
}
