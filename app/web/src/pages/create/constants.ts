import type { Priority, SeverityLevel } from '../../api/types';

/** Niveles 1..4 para severidad/urgencia e impacto. */
export const LEVELS: readonly SeverityLevel[] = [1, 2, 3, 4] as const;

export const LEVEL_LABELS: Record<SeverityLevel, string> = {
  1: 'Baja',
  2: 'Media',
  3: 'Alta',
  4: 'Crítica',
};

/** Descripciones cortas por nivel (incidente: severidad). */
export const SEVERITY_HINTS: Record<SeverityLevel, string> = {
  1: 'Cosmético o mejora menor.',
  2: 'Bug con workaround aceptable.',
  3: 'Funcionalidad clave degradada.',
  4: 'Sistema caído, sin workaround.',
};

/** Descripciones cortas por nivel (solicitud: urgencia). */
export const URGENCY_HINTS: Record<SeverityLevel, string> = {
  1: 'Sin urgencia, backlog general.',
  2: 'En esta semana.',
  3: 'Necesario en menos de 24h.',
  4: 'Bloqueante, atención inmediata.',
};

/** Descripciones cortas por nivel (impacto). */
export const IMPACT_HINTS: Record<SeverityLevel, string> = {
  1: 'Afecta a un solo usuario.',
  2: 'Afecta a un equipo o área.',
  3: 'Afecta a varios equipos.',
  4: 'Afecta a toda la organización.',
};

/**
 * Misma fórmula del backend (el API la recalcula; esto es solo vista previa):
 * severity + impact >= 7 → crítica, >= 5 → alta, >= 4 → media, else baja.
 */
export function computePriority(
  severity: SeverityLevel,
  impact: SeverityLevel,
): Priority {
  const sum = severity + impact;
  if (sum >= 7) return 'critica';
  if (sum >= 5) return 'alta';
  if (sum >= 4) return 'media';
  return 'baja';
}

/** Tiempo de resolución del SLA por prioridad (seeds del contrato, en minutos legibles). */
export const SLA_RESOLVE_LABELS: Record<Priority, string> = {
  critica: '1 hora',
  alta: '4 horas',
  media: '8 horas',
  baja: '24 horas',
};

/** Límites de validación del contrato. */
export const TITLE_MIN = 5;
export const TITLE_MAX = 200;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 5000;
export const MAX_ATTACHMENTS = 10;
export const MAX_FILE_BYTES = 10_485_760; // 10MB
