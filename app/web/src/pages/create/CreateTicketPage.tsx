import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTicket } from '../../api/tickets';
import type {
  CreateTicketRequest,
  SeverityLevel,
  Ticket,
  TicketType,
} from '../../api/types';
import { PriorityBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { AttachmentsField, type UploadedAttachment } from './AttachmentsField';
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  IMPACT_HINTS,
  LEVELS,
  LEVEL_LABELS,
  SEVERITY_HINTS,
  SLA_RESOLVE_LABELS,
  TITLE_MAX,
  TITLE_MIN,
  URGENCY_HINTS,
  computePriority,
} from './constants';
import { SuccessPanel } from './SuccessPanel';

/** Estilo del borde/acento de cada radio card por nivel (4=crítica … 1=baja). */
const LEVEL_ACCENTS: Record<SeverityLevel, { idle: string; text: string }> = {
  1: { idle: 'border-slate-300 hover:bg-slate-50', text: 'text-slate-700' },
  2: { idle: 'border-amber-300 hover:bg-amber-50', text: 'text-amber-700' },
  3: { idle: 'border-orange-300 hover:bg-orange-50', text: 'text-orange-700' },
  4: { idle: 'border-red-300 hover:bg-red-50', text: 'text-red-700' },
};

interface LevelRadioGroupProps {
  legend: string;
  name: 'severity' | 'impact';
  value: SeverityLevel;
  hints: Record<SeverityLevel, string>;
  onChange: (level: SeverityLevel) => void;
  disabled: boolean;
}

/** Radio cards 1..4 (1=Baja … 4=Crítica) para severidad/urgencia e impacto. */
function LevelRadioGroup({
  legend,
  name,
  value,
  hints,
  onChange,
  disabled,
}: LevelRadioGroupProps) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="block text-sm font-semibold text-slate-700">{legend}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {LEVELS.map((level) => {
          const selected = value === level;
          const accent = LEVEL_ACCENTS[level];
          return (
            <label
              key={level}
              className={`relative flex flex-col p-3 border rounded-sm cursor-pointer transition-all ${
                selected
                  ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600'
                  : `bg-white ${accent.idle}`
              }`}
            >
              <input
                type="radio"
                name={name}
                value={level}
                checked={selected}
                onChange={() => onChange(level)}
                className="sr-only"
                data-testid={`create-${name}-${level}`}
              />
              <span
                className={`text-xs font-bold uppercase mb-1 ${
                  selected ? 'text-indigo-700' : accent.text
                }`}
              >
                {level} — {LEVEL_LABELS[level]}
              </span>
              <span className="text-[11px] text-slate-600 leading-tight">
                {hints[level]}
              </span>
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute top-2 right-2 h-4 w-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center"
                >
                  ✓
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const inputClasses =
  'w-full px-3 py-2 bg-white border border-slate-300 rounded-sm text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all';

export function CreateTicketPage() {
  const navigate = useNavigate();

  const [type, setType] = useState<TicketType>('incidente');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel>(2);
  const [impact, setImpact] = useState<SeverityLevel>(2);
  const [desiredDate, setDesiredDate] = useState('');
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);

  const [showValidation, setShowValidation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [created, setCreated] = useState<Ticket | null>(null);

  const isSolicitud = type === 'solicitud';
  const estimatedPriority = computePriority(severity, impact);

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  /** En solicitud, la fecha deseada se antepone a la descripción (el API no tiene campo). */
  const finalDescription =
    isSolicitud && desiredDate
      ? `Fecha deseada: ${desiredDate} — ${trimmedDescription}`
      : trimmedDescription;

  const validationErrors = useMemo(() => {
    const errors: { title?: string; description?: string } = {};
    if (trimmedTitle.length < TITLE_MIN || trimmedTitle.length > TITLE_MAX) {
      errors.title = `El título debe tener entre ${TITLE_MIN} y ${TITLE_MAX} caracteres.`;
    }
    if (
      trimmedDescription.length < DESCRIPTION_MIN ||
      trimmedDescription.length > DESCRIPTION_MAX
    ) {
      errors.description = `La descripción debe tener entre ${DESCRIPTION_MIN} y ${DESCRIPTION_MAX} caracteres.`;
    } else if (finalDescription.length > DESCRIPTION_MAX) {
      errors.description =
        'La descripción más la fecha deseada supera los 5000 caracteres; acórtala.';
    }
    return errors;
  }, [trimmedTitle, trimmedDescription, finalDescription]);

  const hasErrors = Boolean(validationErrors.title ?? validationErrors.description);

  function resetForm() {
    setType('incidente');
    setTitle('');
    setDescription('');
    setSeverity(2);
    setImpact(2);
    setDesiredDate('');
    setAttachments([]);
    setShowValidation(false);
    setSubmitError(null);
    setCreated(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowValidation(true);
    setSubmitError(null);
    if (hasErrors || submitting) return;

    // Solo los campos del contrato (forbidNonWhitelisted → 400 si hay extras).
    const body: CreateTicketRequest = {
      type,
      title: trimmedTitle,
      description: finalDescription,
      severity,
      impact,
      ...(attachments.length > 0
        ? { attachments: attachments.map((a) => a.attachmentId) }
        : {}),
    };

    setSubmitting(true);
    try {
      const ticket = await createTicket(body);
      setCreated(ticket);
    } catch (error) {
      setSubmitError(error);
    } finally {
      setSubmitting(false);
    }
  }

  const tabBase = 'px-6 py-2 rounded-sm text-sm font-semibold transition-all';

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-900">Crear nuevo ticket</h1>
      <p className="mt-1 text-sm text-slate-500">
        Completa los detalles para reportar un incidente o iniciar una solicitud de
        servicio.
      </p>

      <div className="mt-6 grid grid-cols-12 gap-6 items-start">
        {/* Columna izquierda: formulario o confirmación */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          {created ? (
            <SuccessPanel ticket={created} onCreateAnother={resetForm} />
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {/* Tabs de tipo */}
              <div className="flex p-1 bg-slate-200/60 rounded-sm w-fit" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isSolicitud}
                  data-testid="create-type-incidente"
                  onClick={() => setType('incidente')}
                  className={`${tabBase} ${
                    !isSolicitud
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-indigo-600'
                  }`}
                >
                  Incidente
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isSolicitud}
                  data-testid="create-type-solicitud"
                  onClick={() => setType('solicitud')}
                  className={`${tabBase} ${
                    isSolicitud
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-indigo-600'
                  }`}
                >
                  Solicitud de servicio
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-6 space-y-6">
                {isSolicitud && (
                  <div
                    role="note"
                    className="flex items-start gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-sm text-sm text-indigo-800"
                  >
                    <span aria-hidden="true" className="font-bold text-indigo-600">
                      ⓘ
                    </span>
                    <p>
                      Las solicitudes van a una cola separada de los incidentes
                      críticos. Para fallos de disponibilidad usa la pestaña
                      “Incidente”.
                    </p>
                  </div>
                )}

                {/* Título */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="create-title"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Título *
                  </label>
                  <input
                    id="create-title"
                    data-testid="create-title"
                    type="text"
                    value={title}
                    maxLength={TITLE_MAX}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      isSolicitud
                        ? 'Ej. Acceso a Grafana para nuevo integrante'
                        : 'Ej. API de pagos retorna 500 en checkout'
                    }
                    className={inputClasses}
                  />
                  {showValidation && validationErrors.title && (
                    <p className="text-xs text-red-600">{validationErrors.title}</p>
                  )}
                </div>

                {/* Descripción */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="create-description"
                      className="block text-sm font-semibold text-slate-700"
                    >
                      Descripción *
                    </label>
                    <span className="text-xs text-slate-400 tabular-nums">
                      {description.length}/{DESCRIPTION_MAX}
                    </span>
                  </div>
                  <textarea
                    id="create-description"
                    data-testid="create-description"
                    rows={6}
                    value={description}
                    maxLength={DESCRIPTION_MAX}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      isSolicitud
                        ? 'Detalla qué necesitas y para qué…'
                        : 'Describe qué ocurrió, pasos para reproducir, comportamiento esperado…'
                    }
                    className={`${inputClasses} resize-y`}
                  />
                  {showValidation && validationErrors.description && (
                    <p className="text-xs text-red-600">
                      {validationErrors.description}
                    </p>
                  )}
                </div>

                {/* Severidad / Urgencia */}
                <LevelRadioGroup
                  legend={isSolicitud ? 'Urgencia *' : 'Severidad *'}
                  name="severity"
                  value={severity}
                  hints={isSolicitud ? URGENCY_HINTS : SEVERITY_HINTS}
                  onChange={setSeverity}
                  disabled={submitting}
                />

                {/* Impacto */}
                <LevelRadioGroup
                  legend="Impacto *"
                  name="impact"
                  value={impact}
                  hints={IMPACT_HINTS}
                  onChange={setImpact}
                  disabled={submitting}
                />

                {/* Prioridad estimada en vivo */}
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-sm">
                  <span className="text-sm font-semibold text-slate-700">
                    Prioridad estimada:
                  </span>
                  <PriorityBadge priority={estimatedPriority} />
                  <span className="text-xs text-slate-400">
                    SLA de resolución: {SLA_RESOLVE_LABELS[estimatedPriority]}
                  </span>
                </div>

                {/* Fecha deseada (solo solicitud) */}
                {isSolicitud && (
                  <div className="space-y-1.5 max-w-xs">
                    <label
                      htmlFor="create-desired-date"
                      className="block text-sm font-semibold text-slate-700"
                    >
                      Fecha deseada de cumplimiento{' '}
                      <span className="font-normal text-slate-400">(opcional)</span>
                    </label>
                    <input
                      id="create-desired-date"
                      data-testid="create-desired-date"
                      type="date"
                      value={desiredDate}
                      onChange={(e) => setDesiredDate(e.target.value)}
                      className={inputClasses}
                    />
                    <p className="text-[11px] text-slate-400">
                      Se incluirá al inicio de la descripción del ticket.
                    </p>
                  </div>
                )}

                {/* Adjuntos */}
                <AttachmentsField
                  attachments={attachments}
                  onChange={setAttachments}
                  disabled={submitting}
                />
              </div>

              {submitError !== null && (
                <ErrorBanner
                  error={submitError}
                  onDismiss={() => setSubmitError(null)}
                />
              )}

              {/* Acciones */}
              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate('/tickets')}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  data-testid="create-submit"
                  disabled={submitting}
                  className="px-8"
                >
                  {submitting
                    ? 'Enviando…'
                    : isSolicitud
                      ? 'Enviar solicitud'
                      : 'Crear ticket'}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Columna derecha: panel informativo */}
        <aside className="col-span-12 lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">
              ¿Qué pasa después?
            </h3>
            <ol className="space-y-3">
              {[
                <>
                  Se asigna un número{' '}
                  <span className="font-mono text-indigo-600 font-bold">
                    TKT-XXXX
                  </span>{' '}
                  único para seguimiento.
                </>,
                <>
                  Tu ticket se prioriza automáticamente según la{' '}
                  {isSolicitud ? 'urgencia' : 'severidad'} y el impacto
                  seleccionados.
                </>,
                <>Operaciones lo tomará dentro del SLA aplicable a la prioridad.</>,
                <>Podrás seguir el avance desde el detalle del ticket.</>,
              ].map((content, index) => (
                <li key={index} className="flex gap-3">
                  <span className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <p className="text-xs text-slate-600 leading-relaxed">{content}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              SLA por prioridad
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 uppercase tracking-wider">
                  <th className="py-1.5 font-semibold">Prioridad</th>
                  <th className="py-1.5 font-semibold text-right">Resolución</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(['critica', 'alta', 'media', 'baja'] as const).map((priority) => (
                  <tr
                    key={priority}
                    className={
                      !created && priority === estimatedPriority
                        ? 'bg-indigo-50/60'
                        : ''
                    }
                  >
                    <td className="py-2">
                      <PriorityBadge priority={priority} />
                    </td>
                    <td className="py-2 text-right font-medium text-slate-700">
                      {SLA_RESOLVE_LABELS[priority]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!created && (
              <p className="mt-3 text-[11px] text-slate-400">
                Con la selección actual la prioridad estimada es{' '}
                <span className="font-semibold text-slate-600">
                  {estimatedPriority === 'critica'
                    ? 'crítica'
                    : estimatedPriority}
                </span>{' '}
                (SLA: {SLA_RESOLVE_LABELS[estimatedPriority]}).
              </p>
            )}
          </div>

          {isSolicitud && !created && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-sm p-5">
              <h3 className="text-sm font-bold text-indigo-900 mb-2">
                Cola separada de incidentes
              </h3>
              <p className="text-xs text-indigo-800 leading-relaxed">
                Esta solicitud será gestionada bajo un flujo administrativo, de modo
                que los incidentes de disponibilidad no se retrasen por tareas
                programadas.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
