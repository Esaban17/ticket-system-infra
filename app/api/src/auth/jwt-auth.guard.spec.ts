import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersService } from '@/users/users.service';

function ctxWith(
  headers: Record<string, string>,
  store: { user?: unknown } = {},
): ExecutionContext {
  const req = Object.assign(store, { headers });
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function mockToken(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

describe('JwtAuthGuard', () => {
  const users = { findById: jest.fn() } as unknown as UsersService;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new JwtAuthGuard(reflector, users);

  afterEach(() => jest.clearAllMocks());

  it('permite endpoints @Public sin token', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    await expect(guard.canActivate(ctxWith({}))).resolves.toBe(true);
  });

  it('401 si falta el header Authorization', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 si el JWT está mal formado', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    await expect(
      guard.canActivate(ctxWith({ authorization: 'Bearer not-a-jwt' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 si el sujeto no existe en BD', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    (users.findById as jest.Mock).mockResolvedValue(null);
    await expect(
      guard.canActivate(ctxWith({ authorization: `Bearer ${mockToken({ sub: 'ghost' })}` })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('adjunta request.user con un token válido', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    const user = { id: 'u1', role: 'agente' };
    (users.findById as jest.Mock).mockResolvedValue(user);
    const store: { user?: unknown } = {};
    const ctx = ctxWith({ authorization: `Bearer ${mockToken({ sub: 'u1' })}` }, store);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(store.user).toBe(user);
  });
});
