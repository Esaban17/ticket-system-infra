import { useState } from 'react';
import { ApiError } from '../../api/client';
import { assignTicket, changeState } from '../../api/tickets';
import type { Ticket, User } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorBanner } from '../../components/ui/ErrorBanner';

interface ActionsPanelProps {
  ticket: Ticket;
  user: User;
  /** El padre actualiza el ticket en pantalla tras cada acción exitosa. */
  onTicketUpdated: (ticket: Ticket) => void;
  /** En 409 el padre refresca el ticket desde el API. */
  onConflictRefetch: () => Promise<void>;
}

const MIN_TEXT = 20;

/**
 * Bloque "Acciones" según la state machine del contrato:
 * abierto sin assignee → Asignarme; abierto con assignee → Iniciar trabajo;
 * en_progreso → Resolver (causa raíz + solución); abierto → resolver directo
 * solo administrador. Solo assignee o admin pueden cambiar estado.
 */
export function ActionsPanel({
  ticket,
  user,
  onTicketUpdated,
  onConflictRefetch,
}: ActionsPanelProps) {
  const [rootCause, setRootCause] = useState('');
  const [solution, setSolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [conflictNotice, setConflictNotice] = useState(false);

  const isAdmin = user.role === 'administrador';
  const isAssignee = ticket.assigneeId === user.id;
  const canChangeState = isAdmin || isAssignee;

  const showAssignMe = ticket.status === 'abierto' && !ticket.assigneeId;
  const showStartWork = ticket.status === 'abierto' && !!ticket.assigneeId;
  // Resolver: en_progreso (assignee/admin) o abierto→resuelto (solo admin).
  const showResolveForm =
    ticket.status === 'en_progreso' || (ticket.status === 'abierto' && isAdmin);

  if (ticket.status === 'resuelto') {
    return (
      <Card title="Acciones">
        <p className="text-sm text-slate-500">
          El ticket está resuelto. No hay acciones disponibles.
        </p>
      </Card>
    );
  }

  async function run(action: () => Promise<Ticket>) {
    setBusy(true);
    setError(null);
    setConflictNotice(false);
    try {
      const updated = await action();
      onTicketUpdated(updated);
      setRootCause('');
      setSolution('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Optimistic locking: la versión cambió → refetch + aviso.
        setConflictNotice(true);
        await onConflictRefetch();
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  const handleAssignMe = () =>
    run(() =>
      assignTicket(ticket.id, {
        assigneeId: user.id,
        expectedVersion: ticket.version,
      }),
    );

  const handleStartWork = () =>
    run(() =>
      changeState(ticket.id, {
        targetState: 'en_progreso',
        expectedVersion: ticket.version,
      }),
    );

  const rootCauseValid = rootCause.trim().length >= MIN_TEXT;
  const solutionValid = solution.trim().length >= MIN_TEXT;
  const resolveValid = rootCauseValid && solutionValid;

  const handleResolve = () =>
    run(() =>
      changeState(ticket.id, {
        targetState: 'resuelto',
        expectedVersion: ticket.version,
        rootCause: rootCause.trim(),
        solution: solution.trim(),
      }),
    );

  return (
    <Card title="Acciones">
      <div className="flex flex-col gap-4">
        {conflictNotice && (
          <div
            role="status"
            className="bg-amber-50 border border-amber-200 text-amber-800 rounded-sm px-4 py-3 text-sm"
          >
            El ticket fue modificado por otra persona. Se recargaron los datos:
            revisa los cambios e intenta de nuevo.
          </div>
        )}
        {error != null && (
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
        )}

        {showAssignMe && (
          <div>
            <Button
              type="button"
              data-testid="btn-assign-me"
              onClick={() => void handleAssignMe()}
              disabled={busy}
            >
              Asignarme
            </Button>
            <p className="mt-1 text-xs text-slate-500">
              Te asignarás este ticket (asignación a uno mismo).
            </p>
          </div>
        )}

        {showStartWork && (
          <div>
            <Button
              type="button"
              data-testid="btn-start-work"
              onClick={() => void handleStartWork()}
              disabled={busy || !canChangeState}
            >
              Iniciar trabajo
            </Button>
            <p className="mt-1 text-xs text-slate-500">
              {canChangeState
                ? 'Cambia el estado a "En progreso".'
                : 'Solo el agente asignado puede cambiar el estado.'}
            </p>
          </div>
        )}

        {showResolveForm && (
          <form
            className="flex flex-col gap-3 border-t border-slate-200 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleResolve();
            }}
          >
            <h3 className="text-sm font-semibold text-slate-900">Resolver</h3>
            {ticket.status === 'abierto' && isAdmin && (
              <p className="text-xs text-slate-500">
                Como administrador puedes resolver directamente un ticket
                abierto.
              </p>
            )}
            <div>
              <label
                htmlFor="resolve-rootcause"
                className="block text-sm font-medium text-slate-700"
              >
                Causa raíz <span className="text-red-600">*</span>
              </label>
              <textarea
                id="resolve-rootcause"
                data-testid="resolve-rootcause"
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                rows={3}
                disabled={busy || !canChangeState}
                placeholder="Describe la causa raíz (mínimo 20 caracteres)"
                className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:bg-slate-50"
              />
              {rootCause.length > 0 && !rootCauseValid && (
                <p className="mt-1 text-xs text-red-600">
                  Mínimo {MIN_TEXT} caracteres.
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="resolve-solution"
                className="block text-sm font-medium text-slate-700"
              >
                Solución aplicada <span className="text-red-600">*</span>
              </label>
              <textarea
                id="resolve-solution"
                data-testid="resolve-solution"
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                rows={3}
                disabled={busy || !canChangeState}
                placeholder="Describe la solución aplicada (mínimo 20 caracteres)"
                className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:bg-slate-50"
              />
              {solution.length > 0 && !solutionValid && (
                <p className="mt-1 text-xs text-red-600">
                  Mínimo {MIN_TEXT} caracteres.
                </p>
              )}
            </div>
            <div>
              <Button
                type="submit"
                data-testid="btn-resolve"
                disabled={busy || !canChangeState || !resolveValid}
              >
                Marcar como resuelto
              </Button>
              {!canChangeState && (
                <p className="mt-1 text-xs text-slate-500">
                  Solo el agente asignado puede cambiar el estado.
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
