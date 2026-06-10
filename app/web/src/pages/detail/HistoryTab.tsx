import { useCallback, useEffect, useMemo, useState } from 'react';
import { listEvents } from '../../api/tickets';
import { EVENT_TYPES, type EventType, type TicketEvent } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Spinner } from '../../components/ui/Spinner';
import {
  downloadTextFile,
  eventsToCsv,
  formatDateTime,
  payloadEntries,
  EVENT_DOT_CLASSES,
  EVENT_LABELS,
} from './helpers';

const PAGE_SIZE = 20;

/** TAB Historial: timeline paginado de eventos + filtros + export CSV. */
export function HistoryTab({
  ticketId,
  ticketNumber,
}: {
  ticketId: string;
  ticketNumber: string;
}) {
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<EventType>>(
    () => new Set(EVENT_TYPES),
  );

  const loadPage = useCallback(
    async (cursor?: string) => {
      const res = await listEvents(ticketId, {
        limit: PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      });
      setEvents((prev) => (cursor ? [...prev, ...res.items] : res.items));
      setNextCursor(res.nextCursor);
    },
    [ticketId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadPage()
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadPage]);

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      await loadPage(nextCursor);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleType = (type: EventType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const visibleEvents = useMemo(
    () => events.filter((e) => enabledTypes.has(e.eventType)),
    [events, enabledTypes],
  );

  const handleExportCsv = () => {
    const csv = eventsToCsv(visibleEvents);
    downloadTextFile(csv, `historial-${ticketNumber}.csv`);
  };

  if (loading) return <Spinner label="Cargando historial…" />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 flex flex-col gap-4">
        {error != null && (
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
        )}
        <Card title="Actividad del ticket">
          {visibleEvents.length === 0 ? (
            <EmptyState
              title="Sin eventos"
              description="No hay eventos que coincidan con los filtros."
            />
          ) : (
            <ol className="relative ml-2 border-l border-slate-200">
              {visibleEvents.map((event) => {
                const entries = payloadEntries(event.payload);
                return (
                  <li
                    key={event.id}
                    data-testid="event-item"
                    className="relative pl-5 pb-5 last:pb-0"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${
                        EVENT_DOT_CLASSES[event.eventType] ?? 'bg-slate-400'
                      }`}
                    />
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-slate-900">
                        {EVENT_LABELS[event.eventType] ?? event.eventType}
                      </span>
                      <span className="text-xs text-slate-500">
                        {event.actor?.email ?? event.actorId}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatDateTime(event.createdAt)}
                      </span>
                    </div>
                    {entries.length > 0 && (
                      <dl className="mt-1 text-xs text-slate-600">
                        {entries.map(({ label, value }) => (
                          <div key={label} className="flex gap-1">
                            <dt className="font-medium text-slate-500">
                              {label}:
                            </dt>
                            <dd className="break-all">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card title="Filtrar por tipo">
          <div className="flex flex-col gap-2">
            {EVENT_TYPES.map((type) => (
              <label
                key={type}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={enabledTypes.has(type)}
                  onChange={() => toggleType(type)}
                  className="h-4 w-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                {EVENT_LABELS[type]}
              </label>
            ))}
          </div>
        </Card>
        <Card>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={handleExportCsv}
            disabled={visibleEvents.length === 0}
          >
            Exportar historial (CSV)
          </Button>
          <p className="mt-2 text-xs text-slate-500">
            Exporta los {visibleEvents.length} eventos cargados (según
            filtros).
          </p>
        </Card>
      </div>
    </div>
  );
}
