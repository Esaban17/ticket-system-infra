import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../api/client';
import { createComment, listEvents } from '../../api/tickets';
import type { TicketEvent } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Spinner } from '../../components/ui/Spinner';
import { formatDateTime } from './helpers';

const PAGE_SIZE = 50;
// El DTO backend solo valida MinLength(1); aplicamos un máximo razonable en UI.
const MAX_LEN = 5000;

/** Extrae el texto del comentario del payload del evento (clave: message). */
function commentText(event: TicketEvent): string {
  const value = event.payload?.message;
  return typeof value === 'string' ? value : '';
}

/**
 * TAB Comentarios (EP-13 / BL-120): lista los eventos de tipo 'comentario'
 * y permite agregar nuevos. El backend valida RBAC (403 si no autorizado).
 */
export function CommentsTab({ ticketId }: { ticketId: string }) {
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const loadComments = useCallback(async () => {
    const res = await listEvents(ticketId, { limit: PAGE_SIZE });
    setEvents(res.items);
  }, [ticketId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadComments()
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadComments]);

  const comments = useMemo(
    () => events.filter((e) => e.eventType === 'comentario'),
    [events],
  );

  const trimmed = message.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= MAX_LEN;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createComment(ticketId, { message: trimmed });
      setMessage('');
      // Refresca la lista de eventos para mostrar el comentario recién creado.
      await loadComments();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setSubmitError(
          new ApiError(403, {
            type: err.type,
            title: err.title,
            status: 403,
            detail:
              'No tienes permiso para comentar este ticket. Solo puedes comentar tickets propios (reportante) o, si eres agente/administrador, cualquiera.',
          }),
        );
      } else {
        setSubmitError(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner label="Cargando comentarios…" />;

  return (
    <div className="flex flex-col gap-4">
      {error != null && (
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
      )}

      <Card title="Comentarios">
        {comments.length === 0 ? (
          <EmptyState
            title="Sin comentarios"
            description="Aún no hay comentarios en este ticket. Sé el primero en agregar uno."
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {comments.map((event) => (
              <li
                key={event.id}
                data-testid="comment-item"
                className="rounded-sm border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-slate-900">
                    {event.actor?.email ?? event.actorId}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(event.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
                  {commentText(event)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Agregar comentario">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          {submitError != null && (
            <ErrorBanner
              error={submitError}
              onDismiss={() => setSubmitError(null)}
            />
          )}
          <div>
            <label
              htmlFor="comment-input"
              className="block text-sm font-medium text-slate-700"
            >
              Comentario
            </label>
            <textarea
              id="comment-input"
              data-testid="comment-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={MAX_LEN}
              disabled={submitting}
              placeholder="Escribe un comentario…"
              className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:bg-slate-50"
            />
            <p className="mt-1 text-xs text-slate-400">
              {trimmed.length}/{MAX_LEN}
            </p>
          </div>
          <div>
            <Button
              type="submit"
              data-testid="comment-submit"
              disabled={submitting || !canSubmit}
            >
              {submitting ? 'Enviando…' : 'Enviar'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
