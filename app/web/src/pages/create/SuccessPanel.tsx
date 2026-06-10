import { useNavigate } from 'react-router-dom';
import type { Ticket } from '../../api/types';
import { PriorityBadge, TypeBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { SLA_RESOLVE_LABELS } from './constants';

const dateTimeFormatter = new Intl.DateTimeFormat('es', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormatter.format(date);
}

interface SuccessPanelProps {
  ticket: Ticket;
  onCreateAnother: () => void;
}

/** Confirmación de creación: número de ticket, prioridad calculada y SLA. */
export function SuccessPanel({ ticket, onCreateAnother }: SuccessPanelProps) {
  const navigate = useNavigate();

  return (
    <div
      data-testid="create-success"
      className="bg-white border border-slate-200 rounded-sm shadow-sm p-8 flex flex-col items-center text-center"
    >
      <div className="h-12 w-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-4">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="h-6 w-6 text-emerald-600"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-lg font-semibold text-slate-900">
        {ticket.type === 'solicitud'
          ? 'Solicitud creada correctamente'
          : 'Ticket creado correctamente'}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Guarda el número para darle seguimiento.
      </p>

      <p className="mt-6 font-mono text-4xl font-extrabold tracking-tight text-indigo-600">
        {ticket.ticketNumber}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <TypeBadge type={ticket.type} />
        <span className="text-sm text-slate-500">Prioridad:</span>
        <PriorityBadge priority={ticket.priority} />
      </div>

      <div className="mt-6 w-full max-w-sm bg-indigo-50 border border-indigo-100 rounded-sm px-4 py-3 text-sm text-indigo-900">
        <p className="font-semibold">
          SLA de resolución: {SLA_RESOLVE_LABELS[ticket.priority]}
        </p>
        <p className="text-indigo-700 text-xs mt-1">
          Vence el {formatDateTime(ticket.slaDueAt)}
        </p>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button onClick={() => navigate(`/tickets/${ticket.id}`)}>Ver ticket</Button>
        <Button variant="secondary" onClick={onCreateAnother}>
          Crear otro
        </Button>
      </div>
    </div>
  );
}
