import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';

import { requireOwnTicket } from './ownership';

describe('requireOwnTicket', () => {
  it('reportante puede acceder a su propio ticket', () => {
    expect(() =>
      requireOwnTicket({ reporterId: 'u1' }, { id: 'u1', role: Role.reportante }),
    ).not.toThrow();
  });

  it('reportante recibe 404 al pedir ticket ajeno (no filtra existencia)', () => {
    expect(() =>
      requireOwnTicket({ reporterId: 'u2' }, { id: 'u1', role: Role.reportante }),
    ).toThrow(NotFoundException);
  });

  it('agente puede ver cualquier ticket', () => {
    expect(() =>
      requireOwnTicket({ reporterId: 'u2' }, { id: 'u1', role: Role.agente }),
    ).not.toThrow();
  });

  it('administrador puede ver cualquier ticket', () => {
    expect(() =>
      requireOwnTicket({ reporterId: 'u2' }, { id: 'u1', role: Role.administrador }),
    ).not.toThrow();
  });
});
