import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { RolesGuard } from './roles.guard';

function ctxWith(user: { role: Role } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  afterEach(() => jest.clearAllMocks());

  it('permite si el endpoint no declara roles', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    expect(guard.canActivate(ctxWith({ role: Role.reportante }))).toBe(true);
  });

  it('permite si el rol del usuario está en la lista', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.agente, Role.administrador]);
    expect(guard.canActivate(ctxWith({ role: Role.agente }))).toBe(true);
  });

  it('403 si el rol no está permitido', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.agente, Role.administrador]);
    expect(() => guard.canActivate(ctxWith({ role: Role.reportante }))).toThrow(ForbiddenException);
  });
});
