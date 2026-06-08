import { Controller, Get } from '@nestjs/common';

/**
 * Liveness/readiness endpoints used by the ALB target-group health check and
 * the pod readiness/liveness probes. Registered OUTSIDE the /v1 global prefix
 * (see main.ts setGlobalPrefix exclude list), so they answer at /healthz and
 * /readyz — matching var.health_check_path in the ingress module.
 */
@Controller()
export class HealthController {
  @Get('healthz')
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  @Get('readyz')
  readiness(): { status: string } {
    return { status: 'ready' };
  }
}
