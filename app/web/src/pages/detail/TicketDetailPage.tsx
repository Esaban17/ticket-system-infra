import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTicket } from '../../api/tickets';
import type { Ticket } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  PriorityBadge,
  SeverityBadge,
  StatusBadge,
  TypeBadge,
} from '../../components/ui/Badge';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Spinner } from '../../components/ui/Spinner';
import { AttachmentsTab } from './AttachmentsTab';
import { DetailTab } from './DetailTab';
import { formatDateTime } from './helpers';
import { HistoryTab } from './HistoryTab';

type TabId = 'detalle' | 'historial' | 'adjuntos';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'detalle', label: 'Detalle' },
  { id: 'historial', label: 'Historial' },
  { id: 'adjuntos', label: 'Adjuntos' },
];

/** Detalle de ticket (CU-03, CU-05): cabecera + tabs Detalle/Historial/Adjuntos. */
export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [activeTab, setActiveTab] = useState<TabId>('detalle');

  const refetch = useCallback(async () => {
    if (!id) return;
    const fresh = await getTicket(id);
    setTicket(fresh);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTicket(id)
      .then((t) => {
        if (!cancelled) setTicket(t);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const user = session?.user;

  if (loading) return <Spinner label="Cargando ticket…" />;

  if (error != null || !ticket || !user) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorBanner error={error ?? 'No se pudo cargar el ticket.'} />
        <Link
          to="/tickets"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          ← Volver a la cola de tickets
        </Link>
      </div>
    );
  }

  const personLabel = (personId: string | null) => {
    if (!personId) return 'Sin asignar';
    return personId === user.id ? 'Yo' : personId;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera */}
      <header data-testid="detail-header">
        <nav className="text-xs text-slate-500">
          <Link to="/tickets" className="hover:text-indigo-600">
            Cola de tickets
          </Link>{' '}
          <span aria-hidden="true">›</span>{' '}
          <span className="font-mono">{ticket.ticketNumber}</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900">
            <span className="font-mono text-slate-500">
              {ticket.ticketNumber}
            </span>{' '}
            — {ticket.title}
          </h1>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TypeBadge type={ticket.type} />
          <SeverityBadge severity={ticket.severity} />
          <PriorityBadge priority={ticket.priority} />
          <span data-testid="detail-status">
            <StatusBadge status={ticket.status} />
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Reportado por:{' '}
          <span
            className={
              ticket.reporterId === user.id
                ? 'font-medium text-slate-700'
                : 'font-mono'
            }
          >
            {personLabel(ticket.reporterId)}
          </span>
          {' · '}Asignado a:{' '}
          <span
            className={
              ticket.assigneeId === user.id
                ? 'font-medium text-slate-700'
                : ticket.assigneeId
                  ? 'font-mono'
                  : ''
            }
          >
            {personLabel(ticket.assigneeId)}
          </span>
          {' · '}Creado: {formatDateTime(ticket.createdAt)}
          {' · '}Actualizado: {formatDateTime(ticket.updatedAt)}
        </p>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'detalle' && (
        <DetailTab
          ticket={ticket}
          user={user}
          onTicketUpdated={setTicket}
          onConflictRefetch={refetch}
        />
      )}
      {activeTab === 'historial' && (
        <HistoryTab ticketId={ticket.id} ticketNumber={ticket.ticketNumber} />
      )}
      {activeTab === 'adjuntos' && <AttachmentsTab ticket={ticket} />}
    </div>
  );
}
