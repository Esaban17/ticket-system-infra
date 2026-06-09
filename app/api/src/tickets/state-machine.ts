import { Role, TicketStatus } from '@prisma/client';

export interface TransitionResult {
  ok: boolean;
  reason?: string;
}

/**
 * Máquina de estados de ticket como función pura (BL-017). Sin BD ni red.
 * Transiciones válidas:
 *   abierto      → en_progreso  (agente/admin; el handler exige assignee)
 *   en_progreso  → resuelto     (agente/admin; el handler exige assignee + root_cause/solution)
 *   abierto      → resuelto     (solo administrador; override registrado)
 * El `reason` es legible para el body 409/422 del handler.
 */
export function canTransition(
  current: TicketStatus,
  next: TicketStatus,
  role: Role,
): TransitionResult {
  if (current === next) {
    return { ok: false, reason: `El ticket ya está en estado '${current}'` };
  }

  const staff = role === Role.agente || role === Role.administrador;

  if (current === TicketStatus.abierto && next === TicketStatus.en_progreso) {
    return staff
      ? { ok: true }
      : { ok: false, reason: 'Solo agente o administrador pueden iniciar el trabajo' };
  }

  if (current === TicketStatus.en_progreso && next === TicketStatus.resuelto) {
    return staff
      ? { ok: true }
      : { ok: false, reason: 'Solo agente o administrador pueden resolver' };
  }

  if (current === TicketStatus.abierto && next === TicketStatus.resuelto) {
    return role === Role.administrador
      ? { ok: true }
      : { ok: false, reason: 'Resolver un ticket abierto (override) requiere administrador' };
  }

  return { ok: false, reason: `Transición no permitida: ${current} → ${next}` };
}
