import { Injectable } from '@nestjs/common';

export type MetricUnit = 'Count' | 'Milliseconds' | 'Bytes' | 'None';

const NAMESPACE = 'TicketSystem';

/**
 * Métricas custom de negocio vía CloudWatch EMF (BL-044). Emite JSON en formato
 * Embedded Metric Format a stdout; CloudWatch lo parsea como métrica sin SDK ni
 * llamadas de red (las recoge el agente de logs de EKS/Lambda).
 */
@Injectable()
export class MetricsService {
  /** Construye el documento EMF (puro, testeable). */
  build(
    name: string,
    value: number,
    unit: MetricUnit = 'Count',
    dimensions: Record<string, string> = {},
  ): Record<string, unknown> {
    return {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: NAMESPACE,
            Dimensions: [Object.keys(dimensions)],
            Metrics: [{ Name: name, Unit: unit }],
          },
        ],
      },
      ...dimensions,
      [name]: value,
    };
  }

  putMetric(
    name: string,
    value: number,
    unit: MetricUnit = 'Count',
    dimensions: Record<string, string> = {},
  ): void {
    process.stdout.write(JSON.stringify(this.build(name, value, unit, dimensions)) + '\n');
  }

  /** Conveniencia: cuenta 1 unidad de un evento de negocio (ej. ticket_creado). */
  count(name: string, dimensions: Record<string, string> = {}): void {
    this.putMetric(name, 1, 'Count', dimensions);
  }
}
