import { Role, TicketStatus } from '@prisma/client';

import { canTransition } from './state-machine';

describe('canTransition', () => {
  it('abierto → en_progreso permitido a agente/admin', () => {
    expect(canTransition(TicketStatus.abierto, TicketStatus.en_progreso, Role.agente).ok).toBe(
      true,
    );
    expect(
      canTransition(TicketStatus.abierto, TicketStatus.en_progreso, Role.administrador).ok,
    ).toBe(true);
  });

  it('en_progreso → resuelto permitido a agente/admin', () => {
    expect(canTransition(TicketStatus.en_progreso, TicketStatus.resuelto, Role.agente).ok).toBe(
      true,
    );
  });

  it('abierto → resuelto solo admin (override)', () => {
    expect(canTransition(TicketStatus.abierto, TicketStatus.resuelto, Role.administrador).ok).toBe(
      true,
    );
    expect(canTransition(TicketStatus.abierto, TicketStatus.resuelto, Role.agente).ok).toBe(false);
  });

  it('transiciones inválidas devuelven reason', () => {
    expect(
      canTransition(TicketStatus.resuelto, TicketStatus.en_progreso, Role.administrador),
    ).toEqual({
      ok: false,
      reason: expect.stringContaining('no permitida'),
    });
    expect(canTransition(TicketStatus.abierto, TicketStatus.abierto, Role.agente).ok).toBe(false);
    expect(canTransition(TicketStatus.abierto, TicketStatus.en_progreso, Role.reportante).ok).toBe(
      false,
    );
  });
});
