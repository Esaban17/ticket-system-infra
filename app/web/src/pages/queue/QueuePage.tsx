import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { assignTicket, listTickets } from '../../api/tickets';
import type {
  ListTicketsParams,
  Priority,
  SeverityLevel,
  Ticket,
  TicketStatus,
} from '../../api/types';
import { PRIORITIES, TICKET_STATUSES } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  PriorityBadge,
  SeverityBadge,
  StatusBadge,
  TypeBadge,
} from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Spinner } from '../../components/ui/Spinner';
import { TBody, Td, Th, THead } from '../../components/ui/Table';
import { isSlaBreached, slaRemaining } from './sla';

const STATUS_LABELS: Record<TicketStatus, string> = {
  abierto: 'Abierto',
  en_progreso: 'En progreso',
  resuelto: 'Resuelto',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

const SEVERITIES: SeverityLevel[] = [1, 2, 3, 4];

interface Filters {
  status: TicketStatus | '';
  priority: Priority | '';
  severity: '' | `${SeverityLevel}`;
  onlyMine: boolean;
  q: string;
}

const INITIAL_FILTERS: Filters = {
  status: '',
  priority: '',
  severity: '',
  onlyMine: false,
  q: '',
};

function buildParams(filters: Filters, cursor?: string): ListTicketsParams {
  const params: ListTicketsParams = {};
  if (filters.status) params.status = filters.status;
  if (filters.priority) params.priority = filters.priority;
  if (filters.severity) {
    params.severity = Number(filters.severity) as SeverityLevel;
  }
  if (filters.onlyMine) params.assigneeId = 'me';
  const q = filters.q.trim();
  if (q) params.q = q;
  if (cursor) params.cursor = cursor;
  return params;
}

function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function QueuePage() {
  const { session } = useAuth();
  const user = session?.user ?? null;
  const canAssign =
    user?.role === 'agente' || user?.role === 'administrador';

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  // Filtros: qInput es lo que escribe el usuario; q es el valor con debounce.
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [qInput, setQInput] = useState('');

  // Reloj para la cuenta regresiva del SLA (se recalcula cada 30s).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Debounce 400ms de la búsqueda.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((prev) => (prev.q === qInput ? prev : { ...prev, q: qInput }));
    }, 400);
    return () => clearTimeout(timeout);
  }, [qInput]);

  // Evita aplicar respuestas de peticiones obsoletas (carrera entre filtros).
  const requestSeq = useRef(0);

  const fetchFirstPage = useCallback(async (current: Filters) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const response = await listTickets(buildParams(current));
      if (seq !== requestSeq.current) return;
      setTickets(response.items);
      setNextCursor(response.nextCursor);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  // Cambiar cualquier filtro resetea el cursor y recarga desde el inicio.
  useEffect(() => {
    void fetchFirstPage(filters);
  }, [filters, fetchFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await listTickets(buildParams(filters, nextCursor));
      if (seq !== requestSeq.current) return;
      setTickets((prev) => [...prev, ...response.items]);
      setNextCursor(response.nextCursor);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err);
    } finally {
      if (seq === requestSeq.current) setLoadingMore(false);
    }
  }, [filters, nextCursor]);

  const handleAssignMe = useCallback(
    async (ticket: Ticket) => {
      if (!user) return;
      setAssigningId(ticket.id);
      setError(null);
      setNotice(null);
      try {
        const updated = await assignTicket(ticket.id, {
          assigneeId: user.id,
          expectedVersion: ticket.version,
        });
        setTickets((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t)),
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setNotice('El ticket cambió, vuelve a intentar.');
          void fetchFirstPage(filters);
        } else {
          setError(err);
        }
      } finally {
        setAssigningId(null);
      }
    },
    [user, filters, fetchFirstPage],
  );

  const updateFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setQInput('');
    setFilters(INITIAL_FILTERS);
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      filters.status !== '' ||
      filters.priority !== '' ||
      filters.severity !== '' ||
      filters.onlyMine ||
      filters.q.trim() !== '',
    [filters],
  );

  /** "—" si no hay asignado, "Yo" si soy yo, id corto en otro caso. */
  const assigneeLabel = useCallback(
    (assigneeId: string | null): string => {
      if (!assigneeId) return '—';
      if (user && assigneeId === user.id) return 'Yo';
      return assigneeId.slice(0, 8);
    },
    [user],
  );

  const selectClasses =
    'rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Cola de tickets</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ordenada por prioridad calculada
        </p>
      </div>

      {/* Filtros (solo los que soporta el API) */}
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-slate-200 bg-white p-3 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Estado
          <select
            data-testid="filter-status"
            className={selectClasses}
            value={filters.status}
            onChange={(e) =>
              updateFilter('status', e.target.value as Filters['status'])
            }
          >
            <option value="">Todos</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Prioridad
          <select
            data-testid="filter-priority"
            className={selectClasses}
            value={filters.priority}
            onChange={(e) =>
              updateFilter('priority', e.target.value as Filters['priority'])
            }
          >
            <option value="">Todas</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Severidad
          <select
            data-testid="filter-severity"
            className={selectClasses}
            value={filters.severity}
            onChange={(e) =>
              updateFilter('severity', e.target.value as Filters['severity'])
            }
          >
            <option value="">Todas</option>
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                Sev {severity}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Búsqueda
          <input
            data-testid="filter-q"
            type="search"
            placeholder="Buscar por título o descripción"
            className={`${selectClasses} w-64`}
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input
            data-testid="filter-only-mine"
            type="checkbox"
            className="h-4 w-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
            checked={filters.onlyMine}
            onChange={(e) => updateFilter('onlyMine', e.target.checked)}
          />
          Solo míos
        </label>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="pb-2 text-sm font-medium text-indigo-600 underline hover:text-indigo-800"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-start justify-between gap-4 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <p>{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="font-medium text-amber-600 hover:text-amber-800"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
      )}

      {error != null && (
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
      )}

      {loading ? (
        <Spinner label="Cargando tickets…" />
      ) : tickets.length === 0 ? (
        <EmptyState
          title="No hay tickets"
          description={
            hasActiveFilters
              ? 'Ningún ticket coincide con los filtros aplicados.'
              : 'Aún no se ha creado ningún ticket.'
          }
        />
      ) : (
        <>
          {/* Mismo wrapper que components/ui/Table, inline para poder poner data-testid en la <table>. */}
          <div className="overflow-x-auto bg-white border border-slate-200 rounded-sm shadow-sm">
            <table
              data-testid="queue-table"
              className="w-full text-left text-sm border-collapse"
            >
              <THead>
              <tr>
                <Th>#TKT</Th>
                <Th>Tipo</Th>
                <Th className="w-1/4">Título</Th>
                <Th>Severidad</Th>
                <Th>Prioridad</Th>
                <Th>Estado</Th>
                <Th>Asignado</Th>
                <Th>SLA restante</Th>
                <Th>Creado</Th>
                {canAssign && <Th className="text-right">Acciones</Th>}
              </tr>
            </THead>
            <TBody>
              {tickets.map((ticket) => {
                const sla = slaRemaining(ticket.slaDueAt, nowMs);
                const breached = isSlaBreached(ticket, nowMs);
                return (
                  <tr
                    key={ticket.id}
                    data-testid={`ticket-row-${ticket.ticketNumber}`}
                    className={breached ? 'bg-red-50' : undefined}
                  >
                    <Td>
                      <Link
                        to={`/tickets/${ticket.id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        {ticket.ticketNumber}
                      </Link>
                    </Td>
                    <Td>
                      <TypeBadge type={ticket.type} />
                    </Td>
                    <Td className="font-medium text-slate-900">
                      {ticket.title}
                    </Td>
                    <Td>
                      <SeverityBadge severity={ticket.severity} />
                    </Td>
                    <Td>
                      <PriorityBadge priority={ticket.priority} />
                    </Td>
                    <Td>
                      <StatusBadge status={ticket.status} />
                    </Td>
                    <Td>{assigneeLabel(ticket.assigneeId)}</Td>
                    <Td
                      className={
                        breached
                          ? 'font-medium text-red-600'
                          : 'text-slate-600'
                      }
                    >
                      {sla.label}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {formatCreatedAt(ticket.createdAt)}
                    </Td>
                    {canAssign && (
                      <Td className="text-right">
                        {ticket.status !== 'resuelto' && (
                          <Button
                            variant="secondary"
                            data-testid={`assign-me-${ticket.ticketNumber}`}
                            className="px-3 py-1 text-xs"
                            disabled={assigningId === ticket.id}
                            onClick={() => void handleAssignMe(ticket)}
                          >
                            {assigningId === ticket.id
                              ? 'Asignando…'
                              : 'Asignarme'}
                          </Button>
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </TBody>
            </table>
          </div>

          {nextCursor && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                data-testid="load-more"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
