import { listTickets } from '../../api/tickets';
import type { Ticket, TicketStatus } from '../../api/types';

const PAGE_LIMIT = 100;
/** Límite de seguridad para no paginar indefinidamente. */
const MAX_TICKETS = 500;

async function fetchAllByStatus(status: TicketStatus): Promise<Ticket[]> {
  const all: Ticket[] = [];
  let cursor: string | null = null;
  do {
    const page = await listTickets({
      status,
      limit: PAGE_LIMIT,
      ...(cursor ? { cursor } : {}),
    });
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null && all.length < MAX_TICKETS);
  return all;
}

/**
 * Tickets no resueltos: dos llamadas (status=abierto y status=en_progreso),
 * cada una agotando el cursor hasta el límite de seguridad.
 */
export async function fetchUnresolvedTickets(): Promise<Ticket[]> {
  const [abiertos, enProgreso] = await Promise.all([
    fetchAllByStatus('abierto'),
    fetchAllByStatus('en_progreso'),
  ]);
  return [...abiertos, ...enProgreso];
}

/** Vencido: slaDueAt en el pasado (y el ticket no está resuelto). */
export function isOverdue(ticket: Ticket, nowMs: number): boolean {
  return new Date(ticket.slaDueAt).getTime() < nowMs;
}

/** Milisegundos transcurridos desde que venció el SLA (0 si aún no vence). */
export function overdueMs(ticket: Ticket, nowMs: number): number {
  return Math.max(0, nowMs - new Date(ticket.slaDueAt).getTime());
}

/** Formatea una duración en ms como "3h 20m", "45m" o "2d 4h". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
