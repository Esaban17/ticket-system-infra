# ACM cert con validación DNS. Regional (us-east-1) para adjuntarlo al ALB.
resource "aws_acm_certificate" "this" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Validación bloqueante (fase 2): espera a que ACM confirme el cert vía el CNAME
# que el usuario agregó en Hostinger. validation_record_fqdns le indica qué
# registro vigilar (los creamos fuera de Terraform, no en Route53).
resource "aws_acm_certificate_validation" "this" {
  count           = var.enable_validation ? 1 : 0
  certificate_arn = aws_acm_certificate.this.arn

  validation_record_fqdns = [
    for o in aws_acm_certificate.this.domain_validation_options : o.resource_record_name
  ]
}
