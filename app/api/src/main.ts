import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    // Los niveles de log se ajustan desde env LOG_LEVEL en el módulo de config
    bufferLogs: false,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 8080;
  const nodeEnv = configService.get<string>('nodeEnv') ?? 'development';
  const corsOrigins = configService.get<string[]>('cors.origins') ?? [];

  // ── Versionado de API ──────────────────────────────────────────────────────
  // BL-003: todos los endpoints de negocio quedan bajo /v1/
  // /healthz y /readyz se excluyen porque el ALB los sondea sin prefijo.
  app.setGlobalPrefix('v1', {
    exclude: ['/healthz', '/readyz'],
  });

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ── Validación global de DTOs ──────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip propiedades no declaradas en el DTO
      forbidNonWhitelisted: true,
      transform: true, // Transforma tipos automáticamente (string → number, etc.)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Shutdown graceful ──────────────────────────────────────────────────────
  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`Entorno: ${nodeEnv}`);
  logger.log(`API escuchando en http://0.0.0.0:${port}/v1`);
  logger.log(`Healthcheck (fuera de prefijo): http://0.0.0.0:${port}/healthz`);
  logger.log(`Readiness   (fuera de prefijo): http://0.0.0.0:${port}/readyz`);
}

bootstrap().catch((err: unknown) => {
  // Usar console.error aquí porque el Logger de NestJS puede no estar listo
  console.error('Error fatal al arrancar la aplicación:', err);
  process.exit(1);
});
