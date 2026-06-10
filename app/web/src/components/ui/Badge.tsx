import type { Priority, TicketStatus, TicketType } from '../../api/types';

const base =
  'inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border';

// Colores semánticos: crítica=rojo, alta=naranja, media=ámbar, baja=gris.
const priorityStyles: Record<Priority, string> = {
  critica: 'bg-red-50 text-red-700 border-red-200',
  alta: 'bg-orange-50 text-orange-700 border-orange-200',
  media: 'bg-amber-50 text-amber-700 border-amber-200',
  baja: 'bg-slate-50 text-slate-600 border-slate-200',
};

const priorityLabels: Record<Priority, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`${base} ${priorityStyles[priority]}`}>
      {priorityLabels[priority]}
    </span>
  );
}

/** Severidad (1=crítica .. 4=baja) con la misma escala semántica. */
const severityStyles: Record<number, { label: string; classes: string }> = {
  1: { label: 'Sev 1', classes: 'bg-red-50 text-red-700 border-red-200' },
  2: { label: 'Sev 2', classes: 'bg-orange-50 text-orange-700 border-orange-200' },
  3: { label: 'Sev 3', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  4: { label: 'Sev 4', classes: 'bg-slate-50 text-slate-600 border-slate-200' },
};

export function SeverityBadge({ severity }: { severity: number }) {
  const style = severityStyles[severity] ?? severityStyles[4]!;
  return <span className={`${base} ${style.classes}`}>{style.label}</span>;
}

const statusStyles: Record<TicketStatus, string> = {
  abierto: 'bg-blue-50 text-blue-700 border-blue-200',
  en_progreso: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  resuelto: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const statusLabels: Record<TicketStatus, string> = {
  abierto: 'Abierto',
  en_progreso: 'En progreso',
  resuelto: 'Resuelto',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`${base} ${statusStyles[status]}`}>{statusLabels[status]}</span>
  );
}

const typeLabels: Record<TicketType, string> = {
  incidente: 'Incidente',
  solicitud: 'Solicitud',
};

export function TypeBadge({ type }: { type: TicketType }) {
  return (
    <span className={`${base} bg-white text-slate-700 border-slate-300`}>
      {typeLabels[type]}
    </span>
  );
}
