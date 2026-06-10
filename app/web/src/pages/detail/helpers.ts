// Helpers locales de la página de detalle (FE-05). No compartidos.
import type { EventType, TicketEvent } from '../../api/types';

/** Formatea una fecha ISO en local: "17 may 2026, 14:02". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-GT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3h 22m" / "45m" / "2d 4h" a partir de milisegundos restantes (>0). */
export function formatRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Etiquetas en español de cada tipo de evento del historial. */
export const EVENT_LABELS: Record<EventType, string> = {
  ticket_creado: 'Ticket creado',
  asignacion: 'Asignación',
  cambio_estado: 'Cambio de estado',
  resolucion: 'Resolución',
  escalamiento: 'Escalamiento',
  comentario: 'Comentario',
  adjunto_agregado: 'Adjunto agregado',
  adjunto_descargado: 'Adjunto descargado',
};

/** Colores del punto del timeline por tipo de evento. */
export const EVENT_DOT_CLASSES: Record<EventType, string> = {
  ticket_creado: 'bg-blue-500',
  asignacion: 'bg-indigo-500',
  cambio_estado: 'bg-violet-500',
  resolucion: 'bg-emerald-500',
  escalamiento: 'bg-red-500',
  comentario: 'bg-slate-400',
  adjunto_agregado: 'bg-amber-500',
  adjunto_descargado: 'bg-amber-400',
};

/** Etiquetas legibles de claves frecuentes en los payloads de eventos. */
const PAYLOAD_KEY_LABELS: Record<string, string> = {
  from: 'De',
  to: 'A',
  fromState: 'Estado anterior',
  toState: 'Estado nuevo',
  targetState: 'Estado destino',
  previousState: 'Estado anterior',
  assigneeId: 'Asignado a',
  previousAssigneeId: 'Asignado anterior',
  rootCause: 'Causa raíz',
  solution: 'Solución',
  priority: 'Prioridad',
  severity: 'Severidad',
  impact: 'Impacto',
  level: 'Nivel',
  escalationLevel: 'Nivel de escalamiento',
  attachmentId: 'Adjunto',
  filename: 'Archivo',
  comment: 'Comentario',
  ticketNumber: 'Ticket',
  slaDueAt: 'SLA vence',
};

/** Convierte el payload (JSON variable) a pares etiqueta→valor legibles. */
export function payloadEntries(
  payload: Record<string, unknown> | null | undefined,
): Array<{ label: string; value: string }> {
  if (!payload || typeof payload !== 'object') return [];
  return Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      label: PAYLOAD_KEY_LABELS[key] ?? key,
      value:
        typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Genera el CSV (client-side) de los eventos cargados. */
export function eventsToCsv(events: TicketEvent[]): string {
  const header = ['fecha', 'tipo_evento', 'actor_email', 'actor_rol', 'detalle'];
  const rows = events.map((e) => [
    e.createdAt,
    EVENT_LABELS[e.eventType] ?? e.eventType,
    e.actor?.email ?? e.actorId,
    e.actor?.role ?? '',
    payloadEntries(e.payload)
      .map((p) => `${p.label}: ${p.value}`)
      .join('; '),
  ]);
  return [header, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');
}

/** Descarga un texto como archivo vía Blob (sin tocar el API). */
export function downloadTextFile(
  content: string,
  filename: string,
  mime = 'text/csv;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
