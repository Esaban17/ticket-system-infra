import { listTickets } from '../../api/tickets';
import type { Priority, Ticket, TicketStatus } from '../../api/types';
import { PRIORITIES, TICKET_STATUSES } from '../../api/types';

const PAGE_LIMIT = 100;
/** Límite de seguridad: no acumular más de 500 tickets al paginar. */
export const MAX_REPORT_TICKETS = 500;

export interface PeriodFilters {
  /** ISO8601 inicio del período (sobre createdAt). */
  createdFrom: string;
  /** ISO8601 fin del período (sobre createdAt). */
  createdTo: string;
  priority?: Priority;
}

export interface PeriodTickets {
  tickets: Ticket[];
  /** true si se alcanzó el límite de seguridad y quedaron páginas sin leer. */
  truncated: boolean;
}

/** Pagina listTickets (cursor) hasta agotar nextCursor o llegar al límite. */
export async function fetchTicketsForPeriod(
  filters: PeriodFilters,
): Promise<PeriodTickets> {
  const tickets: Ticket[] = [];
  let cursor: string | null = null;
  do {
    const page = await listTickets({
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
      ...(filters.priority ? { priority: filters.priority } : {}),
      limit: PAGE_LIMIT,
      ...(cursor ? { cursor } : {}),
    });
    tickets.push(...page.items);
    cursor = page.nextCursor;
    if (tickets.length >= MAX_REPORT_TICKETS) {
      return {
        tickets: tickets.slice(0, MAX_REPORT_TICKETS),
        truncated: cursor !== null,
      };
    }
  } while (cursor !== null);
  return { tickets, truncated: false };
}

export interface ReportKpis {
  /** Tickets resueltos en el período. */
  resolvedCount: number;
  /** Promedio de resolvedAt - createdAt (ms); null sin resueltos. */
  avgResolutionMs: number | null;
  /** % de resueltos con resolvedAt <= slaDueAt; null sin resueltos. */
  slaCompliancePct: number | null;
  /** Tickets del período aún abiertos o en progreso. */
  openCount: number;
  resolvedByPriority: Record<Priority, number>;
  byStatus: Record<TicketStatus, number>;
}

/** Calcula los KPIs client-side sobre los tickets del período. */
export function computeKpis(tickets: Ticket[]): ReportKpis {
  const resolved = tickets.filter(
    (t) => t.status === 'resuelto' && t.resolvedAt !== null,
  );

  let avgResolutionMs: number | null = null;
  let slaCompliancePct: number | null = null;
  if (resolved.length > 0) {
    const totalMs = resolved.reduce(
      (sum, t) =>
        sum +
        Math.max(
          0,
          new Date(t.resolvedAt as string).getTime() -
            new Date(t.createdAt).getTime(),
        ),
      0,
    );
    avgResolutionMs = totalMs / resolved.length;
    const withinSla = resolved.filter(
      (t) =>
        new Date(t.resolvedAt as string).getTime() <=
        new Date(t.slaDueAt).getTime(),
    ).length;
    slaCompliancePct = Math.round((withinSla / resolved.length) * 100);
  }

  const resolvedByPriority = Object.fromEntries(
    PRIORITIES.map((p) => [p, 0]),
  ) as Record<Priority, number>;
  for (const t of resolved) resolvedByPriority[t.priority] += 1;

  const byStatus = Object.fromEntries(
    TICKET_STATUSES.map((s) => [s, 0]),
  ) as Record<TicketStatus, number>;
  for (const t of tickets) byStatus[t.status] += 1;

  return {
    resolvedCount: resolved.length,
    avgResolutionMs,
    slaCompliancePct,
    openCount: tickets.length - byStatus.resuelto,
    resolvedByPriority,
    byStatus,
  };
}

/** Formatea una duración en ms como "2h 47m", "45m" o "1d 3h". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Fecha local en formato YYYY-MM-DD para <input type="date">. */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Inicio del día local (00:00:00) en ISO8601. */
export function dayStartIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00`).toISOString();
}

/** Fin del día local (23:59:59.999) en ISO8601. */
export function dayEndIso(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59.999`).toISOString();
}
