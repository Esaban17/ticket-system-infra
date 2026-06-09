import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';

/**
 * Inyecta el `User` autenticado (puesto en el request por JwtAuthGuard) en un
 * parámetro del handler. Helper `currentUser()` del BL-028.
 * Uso: create(@CurrentUser() user: User) { ... }
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  const request = ctx.switchToHttp().getRequest<{ user: User }>();
  return request.user;
});
