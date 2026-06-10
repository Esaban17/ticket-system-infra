import { apiUrl } from './client';
import type { ReportsCsvParams } from './types';

/**
 * Construye la URL del reporte CSV (GET /v1/reports/tickets.csv — solo administrador).
 * La descarga requiere el header Authorization, por lo que normalmente se
 * hará vía fetch + blob en el feature de reportes (FE-06).
 */
export function buildReportsCsvUrl(params: ReportsCsvParams = {}): string {
  return apiUrl('/reports/tickets.csv', { ...params });
}
