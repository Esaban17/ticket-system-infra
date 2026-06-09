import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, User } from '@prisma/client';

import { REQUIRED_ROLES_KEY } from './roles.decorator';

/**
 * Guard de RBAC (BL-027). Corre DESPUÉS de JwtAuthGuard. Si el endpoint declara
 * @RequireRole(...), exige que el rol del usuario esté en la lista; si no, 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(REQUIRED_ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const { user } = ctx.switchToHttp().getRequest<{ user?: User }>();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Rol insuficiente para esta operación');
    }
    return true;
  }
}
