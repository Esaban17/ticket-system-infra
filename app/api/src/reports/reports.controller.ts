import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';

import { RequireRole } from '@/auth/roles.decorator';
import { ReportsService } from './reports.service';
import { ReportQuery } from './dto/report-query.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * GET /v1/reports/tickets.csv — export CSV de tickets resueltos (BL-037).
   * Solo administrador (reportante/agente → 403). Respuesta en streaming.
   */
  @Get('tickets.csv')
  @RequireRole(Role.administrador)
  async export(@Query() query: ReportQuery, @Res() res: Response): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tickets-${date}.csv"`);
    for await (const line of this.reports.streamCsv(query)) {
      res.write(line);
    }
    res.end();
  }
}
