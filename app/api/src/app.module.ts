import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { configuration } from '@/config/configuration';
import { validate } from '@/config/env.validation';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';

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

    // TODO (BL-002 — Luis André): importar HealthcheckModule aquí
    // TODO (EP-02): importar módulos de negocio a medida que se implementen
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
  ],
})
export class AppModule {}
