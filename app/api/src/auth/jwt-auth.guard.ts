import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@prisma/client';

import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { UsersService } from '@/users/users.service';

interface JwtPayload {
  sub?: string;
}

/**
 * Guard de autenticación JWT MOCK (BL-027). Para desarrollo: decodifica el JWT
 * SIN verificar la firma (la verificación real contra JWKS de Cognito llega en
 * EP-14). Extrae `sub`, carga el `User` desde BD y lo deja en `request.user`.
 *
 * Los endpoints marcados con @Public() (p.ej. /healthz, /readyz) se omiten.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: User }>();
    const header = request.headers['authorization'] ?? request.headers['Authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el header Authorization: Bearer');
    }

    const sub = this.decodeSub(header.slice('Bearer '.length).trim());
    if (!sub) {
      throw new UnauthorizedException('JWT mal formado');
    }

    const user = await this.users.findById(sub);
    if (!user) {
      throw new UnauthorizedException('El sujeto del token no existe');
    }

    request.user = user;
    return true;
  }

  /** Decodifica el payload del JWT (segmento del medio) sin verificar firma. */
  private decodeSub(token: string): string | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    try {
      const json = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload = JSON.parse(json) as JwtPayload;
      return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
