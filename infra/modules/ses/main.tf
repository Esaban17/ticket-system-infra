# ---------------------------------------------------------------------------
# SES module (EP-12 / BL-119) — verified email identity for ticket notifications.
#
# Provisiona una IDENTIDAD DE EMAIL en Amazon SES para la dirección que recibe
# (y, en sandbox, también envía) los correos de notificación de tickets. Es la
# opción más simple para el modo sandbox: una identidad de email no requiere
# registros DNS (a diferencia de una identidad de dominio); AWS envía un correo
# de verificación a la dirección y queda verificada con un clic.
#
# NOTA: la verificación del email es un paso MANUAL fuera de Terraform (el dueño
# del buzón confirma el enlace). En sandbox, tanto el remitente como el
# destinatario deben estar verificados. No se hace ningún `apply` aquí.
# ---------------------------------------------------------------------------

resource "aws_ses_email_identity" "notification" {
  email = var.notification_email
}
