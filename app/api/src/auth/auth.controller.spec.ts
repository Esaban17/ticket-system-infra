import { UnauthorizedException } from '@nestjs/common';
import { Role, User } from '@prisma/client';

import { AuthController } from './auth.controller';
import { AuthModule } from './auth.module';
import { UsersService } from '@/users/users.service';

const user = {
  id: '6f1f5f1e-0000-4000-8000-000000000001',
  email: 'agente@ticket-system.dev',
  role: Role.agente,
} as User;

describe('AuthController', () => {
  const users = { findByEmail: jest.fn() } as unknown as UsersService;
  const controller = new AuthController(users);

  afterEach(() => jest.clearAllMocks());

  it('login: usuario existente → token mock + user (id, email, role)', async () => {
    (users.findByEmail as jest.Mock).mockResolvedValue(user);

    const result = await controller.login({ email: user.email, password: 'x' });

    expect(users.findByEmail).toHaveBeenCalledWith(user.email);
    expect(result.user).toEqual({ id: user.id, email: user.email, role: Role.agente });

    // El token debe tener el formato que decodifica JwtAuthGuard.
    const parts = result.token.split('.');
    expect(parts).toHaveLength(3);
    expect(parts[2]).toBe('sig');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    expect(header).toEqual({ alg: 'none' });
    expect(payload.sub).toBe(user.id);
    expect(typeof payload.iat).toBe('number');
  });

  it('login: email inexistente → UnauthorizedException (401)', async () => {
    (users.findByEmail as jest.Mock).mockResolvedValue(null);

    await expect(
      controller.login({ email: 'nadie@ticket-system.dev', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login: NO verifica la contraseña (mock hasta EP-14)', async () => {
    (users.findByEmail as jest.Mock).mockResolvedValue(user);

    const a = await controller.login({ email: user.email, password: 'cualquiera' });
    const b = await controller.login({ email: user.email, password: 'otra-distinta' });

    expect(a.user).toEqual(b.user);
    const subOf = (token: string): string =>
      (
        JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as {
          sub: string;
        }
      ).sub;
    expect(subOf(a.token)).toBe(user.id);
    expect(subOf(b.token)).toBe(user.id);
  });

  it('me: devuelve id/email/role del usuario autenticado', () => {
    expect(controller.me(user)).toEqual({
      id: user.id,
      email: user.email,
      role: Role.agente,
    });
  });

  it('AuthModule declara el controller', () => {
    const controllers: unknown[] = Reflect.getMetadata('controllers', AuthModule) ?? [];
    expect(controllers).toContain(AuthController);
  });
});
