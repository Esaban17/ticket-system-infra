import { useEffect, useState } from 'react';
import type { Ticket, User } from '../../api/types';
import { Card } from '../../components/ui/Card';
import { ActionsPanel } from './ActionsPanel';
import { formatDateTime, formatRemaining } from './helpers';

interface DetailTabProps {
  ticket: Ticket;
  user: User;
  onTicketUpdated: (ticket: Ticket) => void;
  onConflictRefetch: () => Promise<void>;
}

/** Estado del SLA derivado de slaDueAt + status (ver contrato, sección SLA). */
function SlaStatus({ ticket }: { ticket: Ticket }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const due = new Date(ticket.slaDueAt).getTime();

  if (ticket.status === 'resuelto') {
    const resolved = ticket.resolvedAt
      ? new Date(ticket.resolvedAt).getTime()
      : null;
    const breached = resolved !== null && resolved > due;
    return (
      <span
        className={`text-sm font-semibold ${breached ? 'text-red-600' : 'text-emerald-600'}`}
      >
        {breached ? 'Resuelto fuera de SLA' : 'Cumplido'}
      </span>
    );
  }

  if (Number.isNaN(due)) return <span className="text-sm text-slate-500">—</span>;

  if (now > due) {
    return <span className="text-sm font-semibold text-red-600">Vencido</span>;
  }
  return (
    <span className="text-sm font-semibold text-slate-900">
      Faltan {formatRemaining(due - now)}
    </span>
  );
}

/** Texto legible del `slaOffByDays` derivado en el servidor (+ vencido, − faltan). */
function slaOffByDaysLabel(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'vence hoy';
  if (days > 0) return `vencido por ${days} día${days === 1 ? '' : 's'}`;
  const n = -days;
  return `faltan ${n} día${n === 1 ? '' : 's'}`;
}

/** TAB Detalle: descripción, resolución (si aplica), panel SLA y acciones. */
export function DetailTab({
  ticket,
  user,
  onTicketUpdated,
  onConflictRefetch,
}: DetailTabProps) {
  const canAct = user.role === 'agente' || user.role === 'administrador';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 flex flex-col gap-4">
        <Card title="Descripción del reporte">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {ticket.description}
          </p>
        </Card>

        {ticket.status === 'resuelto' && (
          <>
            <div className="bg-emerald-50 border border-emerald-200 rounded-sm p-4">
              <h3 className="text-sm font-semibold text-emerald-800">
                Causa raíz
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-900">
                {ticket.rootCause ?? '—'}
              </p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-sm p-4">
              <h3 className="text-sm font-semibold text-emerald-800">
                Solución aplicada
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-900">
                {ticket.solution ?? '—'}
              </p>
              {ticket.resolvedAt && (
                <p className="mt-2 text-xs text-emerald-700">
                  Resuelto el {formatDateTime(ticket.resolvedAt)}
                </p>
              )}
            </div>
          </>
        )}

        {/* Reportante no ve el bloque de acciones (contrato: UI por rol). */}
        {canAct && (
          <ActionsPanel
            ticket={ticket}
            user={user}
            onTicketUpdated={onTicketUpdated}
            onConflictRefetch={onConflictRefetch}
          />
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Card title="Metadatos del ticket">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">SLA de resolución</dt>
              <dd>
                <SlaStatus ticket={ticket} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Vence (slaDueAt)</dt>
              <dd className="text-slate-900">
                {formatDateTime(ticket.slaDueAt)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Estado SLA (servidor)</dt>
              <dd>
                {ticket.slaStatus === null ? (
                  <span className="text-sm text-slate-500">—</span>
                ) : (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-semibold border ${
                      ticket.slaStatus === 'vencido'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {ticket.slaStatus === 'vencido' ? 'vencido' : 'a tiempo'}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Desfase SLA</dt>
              <dd className="text-sm font-medium text-slate-900">
                {slaOffByDaysLabel(ticket.slaOffByDays)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Escalamiento</dt>
              <dd>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border ${
                    ticket.escalationLevel > 0
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  L{ticket.escalationLevel}
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Severidad / Impacto</dt>
              <dd className="text-slate-900">
                {ticket.severity} / {ticket.impact}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Versión</dt>
              <dd className="font-mono text-slate-900">{ticket.version}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
