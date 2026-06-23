import { Injectable } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

/**
 * Repositorio de usuarios (BL-006/BL-007). Encapsula las queries parametrizadas
 * contra la tabla `users`. Consumido por el guard de RBAC para resolver el
 * usuario autenticado a partir del `sub` del JWT.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  /**
   * Provisiona/actualiza un usuario por email (login federado con Cognito,
   * EP-14). En el primer SSO crea la fila; en logins posteriores sincroniza el
   * rol según el grupo de Cognito.
   */
  upsertByEmail(email: string, role: Role): Promise<User> {
    return this.prisma.user.upsert({
      where: { email },
      create: { email, role },
      update: { role },
    });
  }
}
