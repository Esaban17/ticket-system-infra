import { Priority } from '@prisma/client';

/**
 * Función pura de cálculo de prioridad (BL-013).
 * severity e impact en 1..4 donde **4 = más severo / mayor impacto**.
 * Matriz por suma (2..8): a mayor suma, mayor prioridad.
 *   >= 7 → critica | >= 5 → alta | >= 4 → media | resto → baja
 * Misma entrada ⇒ misma salida; sin side-effects.
 */
export function calculatePriority(severity: number, impact: number): Priority {
  if (!Number.isInteger(severity) || severity < 1 || severity > 4) {
    throw new RangeError('severity debe ser un entero en 1..4');
  }
  if (!Number.isInteger(impact) || impact < 1 || impact > 4) {
    throw new RangeError('impact debe ser un entero en 1..4');
  }
  const score = severity + impact;
  if (score >= 7) return Priority.critica;
  if (score >= 5) return Priority.alta;
  if (score >= 4) return Priority.media;
  return Priority.baja;
}
