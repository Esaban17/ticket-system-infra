/**
 * Campos derivados del estado de SLA de un ticket, calculados al momento del
 * request a partir de `slaDueAt`. Función pura (sin BD ni reloj implícito) para
 * poder testearla con un `now` controlado.
 *
 * Contrato (camelCase, consistente con la API: `slaDueAt`, `ticketNumber`):
 *   - slaStatus:    'a_tiempo' si la fecha límite está en el futuro (o es ahora),
 *                   'vencido' si ya pasó, null si el ticket no tiene SLA.
 *   - slaOffByDays: días enteros con signo entre la fecha límite y `now`:
 *                   POSITIVO  = vencido por N días,
 *                   NEGATIVO  = faltan |N| días,
 *                   0         = vence hoy,
 *                   null      = sin SLA.
 *   Es puramente temporal (no considera si el ticket está resuelto): refleja la
 *   relación entre la marca de tiempo actual y la fecha límite, como pide el
 *   contrato del endpoint.
 */

export type SlaStatus = 'a_tiempo' | 'vencido';

export interface SlaFields {
  slaStatus: SlaStatus | null;
  slaOffByDays: number | null;
}

const MS_PER_DAY = 86_400_000;

export function computeSlaFields(slaDueAt: Date | null, now: Date): SlaFields {
  if (!slaDueAt) {
    return { slaStatus: null, slaOffByDays: null };
  }
  const diffMs = now.getTime() - slaDueAt.getTime();
  return {
    slaStatus: diffMs > 0 ? 'vencido' : 'a_tiempo',
    slaOffByDays: Math.floor(diffMs / MS_PER_DAY),
  };
}
