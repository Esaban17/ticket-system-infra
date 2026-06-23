# ---------------------------------------------------------------------------
# TLS module — certificado ACM (validación DNS) para el dominio de la app.
#
# El cert se crea siempre (queda PENDING_VALIDATION y expone los registros de
# validación). La validación bloqueante (aws_acm_certificate_validation) se
# habilita con enable_validation para no trabar el primer apply: el DNS vive en
# Hostinger y el usuario agrega el registro manualmente entre fases.
# ---------------------------------------------------------------------------

variable "domain_name" {
  description = "FQDN para el que se emite el certificado (p.ej. tickets.nextcodegt.com)."
  type        = string
}

variable "enable_validation" {
  description = "Si true, crea aws_acm_certificate_validation (espera a que ACM marque ISSUED). Requiere que el registro CNAME de validación ya exista en el DNS. Fase 2."
  type        = bool
  default     = false
}
