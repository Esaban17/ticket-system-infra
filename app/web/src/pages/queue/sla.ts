import type { Ticket } from '../../api/types';

export interface SlaInfo {
  /** Texto a mostrar: "2h 15m", "Vencido hace 1h" o "—". */
  label: string;
  /** true si now > slaDueAt (independiente del estado del ticket). */
  overdue: boolean;
}

/** Formatea una duración positiva en minutos como "2h 15m" / "45m". */
function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Cuenta regresiva del SLA derivada de slaDueAt respecto a `nowMs`. */
export function slaRemaining(slaDueAt: string | null, nowMs: number): SlaInfo {
  if (!slaDueAt) return { label: '—', overdue: false };

  const dueMs = new Date(slaDueAt).getTime();
  if (Number.isNaN(dueMs)) return { label: '—', overdue: false };

  const diffMinutes = Math.floor((dueMs - nowMs) / 60_000);
  if (diffMinutes >= 0) {
    return { label: formatDuration(diffMinutes), overdue: false };
  }
  return { label: `Vencido hace ${formatDuration(-diffMinutes)}`, overdue: true };
}

/** SLA vencido y aún sin resolver → la fila se resalta en rojo. */
export function isSlaBreached(ticket: Ticket, nowMs: number): boolean {
  return (
    slaRemaining(ticket.slaDueAt, nowMs).overdue && ticket.status !== 'resuelto'
  );
}
