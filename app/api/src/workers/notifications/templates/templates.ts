import { NotificationMessage } from '../notification-message';

export interface EmailContent {
  subject: string;
  body: string;
}

const TITLES: Record<NotificationMessage['eventType'], string> = {
  ticket_creado: 'Ticket creado',
  asignacion: 'Ticket asignado',
  cambio_estado: 'Cambio de estado',
  resolucion: 'Ticket resuelto',
  escalamiento: 'Ticket escalado',
};

/** Render de email por tipo de evento (BL-034). Puro, testeable con snapshots. */
export function renderEmail(msg: NotificationMessage): EmailContent {
  const label = TITLES[msg.eventType];
  return {
    subject: `[${msg.ticketNumber}] ${label}: ${msg.title}`,
    body:
      `Hola,\n\n${label} para el ticket ${msg.ticketNumber} — "${msg.title}".\n\n` +
      `Ingresa al sistema para ver el detalle.\n\n— Sistema de Tickets`,
  };
}

/** Render de mensaje Slack por tipo de evento (BL-034). */
export function renderSlack(msg: NotificationMessage): { text: string } {
  const label = TITLES[msg.eventType];
  return { text: `:ticket: *${label}* — \`${msg.ticketNumber}\` ${msg.title}` };
}
