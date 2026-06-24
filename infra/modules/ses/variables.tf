# ---------------------------------------------------------------------------
# SES module — input variables (EP-12 / BL-119).
# ---------------------------------------------------------------------------

variable "notification_email" {
  description = "Dirección de email verificada en SES usada como remitente (Source) y, en modo sandbox, también como destinatario de prueba de los correos de notificación de tickets (resuelto/comentado/asignado). Una identidad de email no requiere DNS; AWS le envía un correo de verificación que el dueño confirma manualmente."
  type        = string
  default     = "estuardo1314@gmail.com"
}
