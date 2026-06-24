import { z } from 'zod';

/**
 * Tipos de evento de ticket que disparan un correo al reportante (EP-12 / BL-119):
 *   - ticket.resolved  → el ticket se cerró/resolvió
 *   - ticket.commented → el ticket recibió un comentario/mensaje
 *   - ticket.assigned  → alguien empezó a atender el ticket (asignación)
 */
export const TICKET_NOTIFY_TYPES = [
  'ticket.resolved',
  'ticket.commented',
  'ticket.assigned',
] as const;

export type TicketNotifyType = (typeof TICKET_NOTIFY_TYPES)[number];

/**
 * Mensaje SQS de notificación de ticket. Es AUTOCONTENIDO: TicketsService
 * resuelve el correo del reportante y arma subject/body al encolar, de modo que
 * el consumer solo tenga que despachar (no necesita la BD para enviar el email).
 * `recipientEmail` opcional permite, si en el futuro se quiere, resolver el
 * canal por preferencias; hoy ya viene resuelto desde el productor.
 */
export const ticketNotificationSchema = z.object({
  type: z.enum(TICKET_NOTIFY_TYPES),
  ticketId: z.string().uuid(),
  recipientEmail: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export type TicketNotification = z.infer<typeof ticketNotificationSchema>;

/** True si el body SQS parseado es un mensaje de notificación de ticket. */
export function isTicketNotification(raw: unknown): raw is TicketNotification {
  return ticketNotificationSchema.safeParse(raw).success;
}
