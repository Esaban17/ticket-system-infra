import { Global, Module } from '@nestjs/common';

import { JsonLoggerService } from './services/logger.service';
import { MetricsService } from './services/metrics.service';

/**
 * Observabilidad (EP-18): logger estructurado JSON + métricas EMF, globales
 * para que cualquier servicio los inyecte. El RequestIdMiddleware se aplica
 * desde AppModule (configure).
 */
@Global()
@Module({
  providers: [JsonLoggerService, MetricsService],
  exports: [JsonLoggerService, MetricsService],
})
export class ObservabilityModule {}
