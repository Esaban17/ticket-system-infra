import { Injectable } from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { ReportQuery } from './dto/report-query.dto';
import { csvRow } from './csv';

const BATCH = 500;

const HEADER = [
  'ticket_number',
  'type',
  'title',
  'severity',
  'impact',
  'priority',
  'status',
  'reporter_email',
  'assignee_email',
  'created_at',
  'resolved_at',
  'time_to_resolve_minutes',
  'escalation_level',
  'sla_breached',
];

type Row = Prisma.TicketGetPayload<{
  include: { reporter: { select: { email: true } }; assignee: { select: { email: true } } };
}>;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(q: ReportQuery): Prisma.TicketWhereInput {
    const where: Prisma.TicketWhereInput = { status: TicketStatus.resuelto };
    if (q.priority) where.priority = q.priority as Prisma.TicketWhereInput['priority'];
    if (q.assigneeId) where.assigneeId = q.assigneeId;
    if (q.from || q.to) {
      where.resolvedAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    return where;
  }

  /** Una fila CSV del reporte, con columnas calculadas (BL-036). */
  toCsvRow(t: Row): string {
    const ttr =
      t.resolvedAt && t.createdAt
        ? Math.round((t.resolvedAt.getTime() - t.createdAt.getTime()) / 60000)
        : '';
    const slaBreached =
      t.resolvedAt && t.slaDueAt ? t.resolvedAt.getTime() > t.slaDueAt.getTime() : false;
    return csvRow([
      t.ticketNumber,
      t.type,
      t.title,
      t.severity,
      t.impact,
      t.priority,
      t.status,
      t.reporter?.email ?? '',
      t.assignee?.email ?? '',
      t.createdAt.toISOString(),
      t.resolvedAt?.toISOString() ?? '',
      ttr,
      t.escalationLevel,
      slaBreached,
    ]);
  }

  /**
   * Genera el CSV como stream (BL-037): pagina por cursor (no carga todo en
   * memoria) y emite el header + una fila por ticket resuelto del período.
   */
  async *streamCsv(q: ReportQuery): AsyncGenerator<string> {
    yield csvRow(HEADER);
    const where = this.buildWhere(q);
    let cursor: string | undefined;
    for (;;) {
      const batch: Row[] = await this.prisma.ticket.findMany({
        where,
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { reporter: { select: { email: true } }, assignee: { select: { email: true } } },
      });
      if (batch.length === 0) break;
      for (const t of batch) yield this.toCsvRow(t);
      if (batch.length < BATCH) break;
      cursor = batch[batch.length - 1].id;
    }
  }
}
