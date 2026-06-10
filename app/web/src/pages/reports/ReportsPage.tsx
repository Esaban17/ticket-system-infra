import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { buildReportsCsvUrl } from '../../api/reports';
import type { Priority, ProblemDetails, TicketStatus } from '../../api/types';
import { PRIORITIES, TICKET_STATUSES } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Spinner } from '../../components/ui/Spinner';
import {
  computeKpis,
  dayEndIso,
  dayStartIso,
  fetchTicketsForPeriod,
  formatDuration,
  MAX_REPORT_TICKETS,
  toDateInputValue,
  type PeriodTickets,
} from './reportsData';

const PRIORITY_LABELS: Record<Priority, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

const PRIORITY_BAR_COLORS: Record<Priority, string> = {
  critica: 'bg-red-500',
  alta: 'bg-orange-500',
  media: 'bg-amber-500',
  baja: 'bg-slate-400',
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  abierto: 'Abierto',
  en_progreso: 'En progreso',
  resuelto: 'Resuelto',
};

const STATUS_BAR_COLORS: Record<TicketStatus, string> = {
  abierto: 'bg-blue-500',
  en_progreso: 'bg-indigo-500',
  resuelto: 'bg-emerald-500',
};

const inputClasses =
  'border border-slate-300 rounded-sm px-2 py-1.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toDateInputValue(d);
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-4 flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-2xl font-bold text-slate-900">{value}</span>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  colorClass,
}: {
  label: string;
  value: number;
  max: number;
  colorClass: string;
}) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span>{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="w-full bg-slate-100 h-4 rounded-sm overflow-hidden">
        <div className={`${colorClass} h-full`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function ReportsPage() {
  const { session } = useAuth();

  // Filtros del formulario (default: últimos 30 días, todas las prioridades).
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => toDateInputValue(new Date()));
  const [priority, setPriority] = useState<'' | Priority>('');

  const [data, setData] = useState<PeriodTickets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(
    async (fromValue: string, toValue: string, priorityValue: '' | Priority) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchTicketsForPeriod({
          createdFrom: dayStartIso(fromValue),
          createdTo: dayEndIso(toValue),
          ...(priorityValue ? { priority: priorityValue } : {}),
        });
        setData(result);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(defaultFrom(), toDateInputValue(new Date()), '');
  }, [load]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void load(from, to, priority);
  };

  const handleDownloadCsv = async () => {
    if (!session) return;
    setDownloading(true);
    setError(null);
    try {
      const url = buildReportsCsvUrl({
        from: dayStartIso(from),
        to: dayEndIso(to),
        ...(priority ? { priority } : {}),
      });
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!response.ok) {
        let problem: ProblemDetails | undefined;
        try {
          problem = (await response.json()) as ProblemDetails;
        } catch {
          problem = undefined;
        }
        throw new ApiError(response.status, problem);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'tickets.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err);
    } finally {
      setDownloading(false);
    }
  };

  const kpis = useMemo(() => (data ? computeKpis(data.tickets) : null), [data]);

  const maxResolvedByPriority = kpis
    ? Math.max(...PRIORITIES.map((p) => kpis.resolvedByPriority[p]))
    : 0;
  const maxByStatus = kpis
    ? Math.max(...TICKET_STATUSES.map((s) => kpis.byStatus[s]))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Reportes de resolución
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Métricas del período calculadas sobre los tickets creados en el rango
            seleccionado.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-sm shadow-sm p-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="reports-from" className="text-xs font-medium text-slate-500">
              Desde
            </label>
            <input
              id="reports-from"
              type="date"
              required
              max={to}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClasses}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="reports-to" className="text-xs font-medium text-slate-500">
              Hasta
            </label>
            <input
              id="reports-to"
              type="date"
              required
              min={from}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputClasses}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reports-priority"
              className="text-xs font-medium text-slate-500"
            >
              Prioridad
            </label>
            <select
              id="reports-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as '' | Priority)}
              className={inputClasses}
            >
              <option value="">Todas</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" disabled={loading}>
            Aplicar
          </Button>
          <Button
            type="button"
            data-testid="reports-download-csv"
            onClick={() => void handleDownloadCsv()}
            disabled={downloading}
          >
            {downloading ? 'Descargando…' : 'Descargar CSV'}
          </Button>
        </form>
      </div>

      {error !== null && error !== undefined && (
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
      )}

      {loading ? (
        <Spinner label="Calculando métricas…" />
      ) : kpis && data ? (
        <>
          {data.truncated && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
              El período contiene más de {MAX_REPORT_TICKETS} tickets; las métricas
              se calcularon sobre los primeros {MAX_REPORT_TICKETS}. Acota el rango
              de fechas para mayor precisión.
            </p>
          )}

          <div
            data-testid="reports-kpis"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <KpiCard label="Tickets resueltos" value={String(kpis.resolvedCount)} />
            <KpiCard
              label="Tiempo promedio de resolución"
              value={
                kpis.avgResolutionMs !== null
                  ? formatDuration(kpis.avgResolutionMs)
                  : '—'
              }
            />
            <KpiCard
              label="% dentro de SLA"
              value={
                kpis.slaCompliancePct !== null ? `${kpis.slaCompliancePct}%` : '—'
              }
            />
            <KpiCard label="Abiertos del período" value={String(kpis.openCount)} />
          </div>

          {data.tickets.length === 0 ? (
            <EmptyState
              title="Sin tickets en el período"
              description="No se encontraron tickets creados en el rango seleccionado."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="Resueltos por prioridad">
                <div className="space-y-3">
                  {PRIORITIES.map((p) => (
                    <BarRow
                      key={p}
                      label={PRIORITY_LABELS[p]}
                      value={kpis.resolvedByPriority[p]}
                      max={maxResolvedByPriority}
                      colorClass={PRIORITY_BAR_COLORS[p]}
                    />
                  ))}
                </div>
              </Card>
              <Card title="Distribución por estado">
                <div className="space-y-3">
                  {TICKET_STATUSES.map((s) => (
                    <BarRow
                      key={s}
                      label={STATUS_LABELS[s]}
                      value={kpis.byStatus[s]}
                      max={maxByStatus}
                      colorClass={STATUS_BAR_COLORS[s]}
                    />
                  ))}
                </div>
              </Card>
            </div>
          )}

          <p className="text-xs italic text-slate-500">
            * KPIs calculados client-side sobre tickets creados en el período. El
            CSV descargable filtra por fecha de resolución (resolvedAt), según el
            contrato del API.
          </p>
        </>
      ) : null}
    </div>
  );
}
