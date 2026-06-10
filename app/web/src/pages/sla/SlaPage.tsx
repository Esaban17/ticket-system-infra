import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { assignTicket } from '../../api/tickets';
import type { Ticket } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PriorityBadge, SeverityBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Spinner } from '../../components/ui/Spinner';
import { Table, TBody, Td, Th, THead } from '../../components/ui/Table';
import {
  fetchUnresolvedTickets,
  formatDuration,
  isOverdue,
  overdueMs,
} from './slaData';

/** Intervalo de auto-refresh (el escalamiento lo ejecuta el worker EP-11). */
const REFRESH_INTERVAL_MS = 60_000;

/** Badge de nivel de escalamiento L0..L3 (L3 destacado en rojo). */
function LevelBadge({ level }: { level: number }) {
  const classes =
    level >= 3
      ? 'bg-red-600 text-white border-red-600'
      : level > 0
        ? 'bg-orange-50 text-orange-700 border-orange-200'
        : 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-semibold border ${classes}`}
    >
      L{level}
    </span>
  );
}

function KpiCard({
  label,
  value,
  highlight = false,
  testId,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  testId?: string;
}) {
  return (
    <div
      {...(testId ? { 'data-testid': testId } : {})}
      className={`bg-white border rounded-sm shadow-sm p-4 flex flex-col gap-1 ${
        highlight && value > 0 ? 'border-red-300' : 'border-slate-200'
      }`}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span
        className={`text-2xl font-bold ${
          highlight && value > 0 ? 'text-red-600' : 'text-slate-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function SlaPage() {
  const { session } = useAuth();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const items = await fetchUnresolvedTickets();
      setTickets(items);
      setNow(Date.now());
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const handleAssignMe = useCallback(
    async (ticket: Ticket) => {
      if (!session) return;
      setAssigningId(ticket.id);
      setNotice(null);
      setError(null);
      try {
        await assignTicket(ticket.id, {
          assigneeId: session.user.id,
          expectedVersion: ticket.version,
        });
        await load();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          // Optimistic locking: la versión cambió → refetch y avisar.
          setNotice(
            `El ticket ${ticket.ticketNumber} fue modificado por otra persona. ` +
              'La lista se actualizó; intenta asignarte de nuevo.',
          );
          await load();
        } else {
          setError(err);
        }
      } finally {
        setAssigningId(null);
      }
    },
    [session, load],
  );

  const derived = useMemo(() => {
    if (!tickets) return null;
    const relevant = tickets
      .filter((t) => isOverdue(t, now) || t.escalationLevel > 0)
      .sort((a, b) => overdueMs(b, now) - overdueMs(a, now));
    const overdue = tickets.filter((t) => isOverdue(t, now));
    const countLevel = (level: number) =>
      relevant.filter((t) => t.escalationLevel === level).length;
    return {
      relevant,
      overdueCount: overdue.length,
      l1: countLevel(1),
      l2: countLevel(2),
      l3: countLevel(3),
      overdueNotEscalated: overdue.filter((t) => t.escalationLevel === 0).length,
    };
  }, [tickets, now]);

  const canAssign = session?.user.role !== 'reportante';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Tickets escalados por SLA
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tickets cuyo SLA de resolución se venció o que fueron escalados al
          siguiente nivel. Se actualiza automáticamente cada 60 segundos.
        </p>
      </div>

      {error !== null && error !== undefined && (
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start justify-between gap-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-sm px-4 py-3 text-sm"
        >
          <p>{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-amber-600 hover:text-amber-800 font-medium"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
      )}

      {derived === null ? (
        <Spinner label="Cargando tickets…" />
      ) : (
        <>
          {derived.overdueCount > 0 && (
            <div
              data-testid="sla-banner"
              role="alert"
              className="flex items-center gap-3 bg-red-50 border-2 border-red-300 text-red-800 rounded-sm px-4 py-3"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                ⚠
              </span>
              <p className="text-sm font-semibold uppercase tracking-tight">
                {derived.overdueCount}{' '}
                {derived.overdueCount === 1
                  ? 'ticket no resuelto superó'
                  : 'tickets no resueltos superaron'}{' '}
                su SLA{derived.l3 > 0 ? ` — ${derived.l3} actualmente en L3` : ''}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Escalados en L1" value={derived.l1} testId="sla-kpi-l1" />
            <KpiCard label="Escalados en L2" value={derived.l2} testId="sla-kpi-l2" />
            <KpiCard
              label="Escalados en L3"
              value={derived.l3}
              highlight
              testId="sla-kpi-l3"
            />
            <KpiCard
              label="Vencidos sin escalar"
              value={derived.overdueNotEscalated}
              testId="sla-kpi-overdue"
            />
          </div>

          {derived.relevant.length === 0 ? (
            <EmptyState
              title="Sin tickets fuera de SLA"
              description="Ningún ticket abierto o en progreso está vencido ni escalado."
            />
          ) : (
            <div data-testid="sla-table">
              <Table>
                <THead>
                  <tr>
                    <Th>Ticket</Th>
                    <Th>Título</Th>
                    <Th>Prioridad</Th>
                    <Th>Severidad</Th>
                    <Th>Tiempo fuera de SLA</Th>
                    <Th>Nivel</Th>
                    <Th>Asignado</Th>
                    {canAssign && <Th className="text-right">Acción</Th>}
                  </tr>
                </THead>
                <TBody>
                  {derived.relevant.map((ticket) => {
                    const ms = overdueMs(ticket, now);
                    const isMine = ticket.assigneeId === session?.user.id;
                    return (
                      <tr key={ticket.id} className="hover:bg-slate-50">
                        <Td className="font-semibold whitespace-nowrap">
                          <Link
                            to={`/tickets/${ticket.id}`}
                            className="text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            {ticket.ticketNumber}
                          </Link>
                        </Td>
                        <Td className="max-w-[28rem]">
                          <span className="block truncate" title={ticket.title}>
                            {ticket.title}
                          </span>
                        </Td>
                        <Td>
                          <PriorityBadge priority={ticket.priority} />
                        </Td>
                        <Td>
                          <SeverityBadge severity={ticket.severity} />
                        </Td>
                        <Td
                          className={
                            ms > 0
                              ? 'text-red-600 font-bold whitespace-nowrap'
                              : 'text-slate-400 whitespace-nowrap'
                          }
                        >
                          {ms > 0 ? formatDuration(ms) : '—'}
                        </Td>
                        <Td>
                          <LevelBadge level={ticket.escalationLevel} />
                        </Td>
                        <Td className="whitespace-nowrap">
                          {ticket.assigneeId === null ? (
                            <span className="italic text-slate-400">Sin asignar</span>
                          ) : isMine ? (
                            <span className="font-medium text-slate-900">Yo</span>
                          ) : (
                            <span
                              className="font-mono text-xs text-slate-500"
                              title={ticket.assigneeId}
                            >
                              {ticket.assigneeId.slice(0, 8)}…
                            </span>
                          )}
                        </Td>
                        {canAssign && (
                          <Td className="text-right">
                            {!isMine && (
                              <Button
                                variant="secondary"
                                className="!px-2 !py-1 text-xs"
                                disabled={assigningId !== null}
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
              </Table>
            </div>
          )}

          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span
              aria-hidden="true"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 font-semibold"
            >
              i
            </span>
            El escalamiento automático L1→L3 lo ejecuta el worker EP-11.
          </p>
        </>
      )}
    </div>
  );
}
