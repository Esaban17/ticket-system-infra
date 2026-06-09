import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { configuration } from '@/config/configuration';
import { validate } from '@/config/env.validation';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { RolesGuard } from '@/auth/roles.guard';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersModule } from '@/users/users.module';
import { TicketsModule } from '@/tickets/tickets.module';
import { HealthController } from '@/health/health.controller';

/**
 * Módulo raíz de la aplicación.
 *
 * Módulos de negocio pendientes (EP-02 y siguientes):
 *   - AuthModule       — JWT, guardias, RBAC         (BL-006)
 *   - UsersModule      — CRUD de usuarios/agentes     (EP-02)
 *   - TicketsModule    — Ciclo de vida de tickets     (EP-03)
 *   - CommentsModule   — Comentarios en tickets       (EP-04)
 *   - SlaModule        — Timers y escalamiento SLA    (EP-05)
 *   - NotificationsModule — Email/webhook vía SQS    (EP-06)
 *
 * HealthcheckModule (BL-002) será agregado por Luis André.
 */
@Module({
  imports: [
    // ConfigModule global — valida env vars al arrancar
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      load: [() => configuration(validate(process.env as Record<string, unknown>))],
      cache: true,
    }),

    // Persistencia + dominio.
    PrismaModule,
    UsersModule,
    TicketsModule,
  ],
  controllers: [
    // Liveness/readiness probes for the ALB target group (outside /v1 prefix).
    HealthController,
  ],
  providers: [
    // Filtro global de excepciones HTTP
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Interceptor global de logging estructurado
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // RBAC global (EP-07): autentica (mock JWT) y luego valida rol. Los
    // endpoints @Public() (healthz/readyz) se omiten. El orden importa:
    // JwtAuthGuard puebla request.user antes de que RolesGuard lo evalúe.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
