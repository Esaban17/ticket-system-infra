import { z } from 'zod';

/** Tipos de evento que disparan notificación. */
export const NOTIFY_EVENTS = [
  'ticket_creado',
  'asignacion',
  'cambio_estado',
  'resolucion',
  'escalamiento',
] as const;

/**
 * Schema del mensaje SQS de notificación (BL-032). Validado con zod antes de
 * procesar; un mensaje inválido se descarta (no rompe el batch).
 */
export const notificationMessageSchema = z.object({
  ticketId: z.string().uuid(),
  ticketNumber: z.string().min(1),
  title: z.string().min(1),
  eventType: z.enum(NOTIFY_EVENTS),
  recipientId: z.string().uuid(),
  requestId: z.string().optional(),
});

export type NotificationMessage = z.infer<typeof notificationMessageSchema>;

export function parseMessage(raw: unknown): NotificationMessage {
  return notificationMessageSchema.parse(raw);
}
