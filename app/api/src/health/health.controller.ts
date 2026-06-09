import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';

const READINESS_DB_TIMEOUT_MS = 2000;

/**
 * Liveness/readiness para el target group del ALB y los probes del pod.
 * Fuera del prefijo global /v1 (ver main.ts exclude), responden en /healthz y
 * /readyz — matching var.health_check_path del módulo ingress.
 *
 * BL-002:
 *  - /healthz: 200 si el proceso vive, SIN tocar la BD (no marca unhealthy por
 *    una BD caída).
 *  - /readyz:  ejecuta SELECT 1 con timeout de 2s; 200 si OK, 503 si falla, para
 *    que el ALB no enrute tráfico durante warm-up o cuando la BD no responde.
 */
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('healthz')
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readiness(): Promise<{ status: string }> {
    try {
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`, READINESS_DB_TIMEOUT_MS);
      return { status: 'ready' };
    } catch {
      throw new HttpException({ status: 'not-ready' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_resolve, reject) =>
        setTimeout(() => reject(new Error('readiness DB check timeout')), ms),
      ),
    ]);
  }
}
