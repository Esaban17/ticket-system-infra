import { csvField, csvRow } from './csv';
import { ReportsService } from './reports.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('csv escaping', () => {
  it('campos simples no se citan', () => {
    expect(csvField('abc')).toBe('abc');
    expect(csvField(123)).toBe('123');
  });
  it('cita y duplica comillas si hay coma/comilla/newline', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('di "hola"')).toBe('"di ""hola"""');
    expect(csvField('línea1\nlínea2')).toBe('"línea1\nlínea2"');
  });
  it('csvRow termina en CRLF', () => {
    expect(csvRow(['a', 'b'])).toBe('a,b\r\n');
  });
});

function makeRow(over: Record<string, unknown> = {}) {
  return {
    ticketNumber: 'TKT-0001',
    type: 'incidente',
    title: 'Título con, coma',
    severity: 4,
    impact: 4,
    priority: 'critica',
    status: 'resuelto',
    reporter: { email: 'r@t.dev' },
    assignee: { email: 'a@t.dev' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    resolvedAt: new Date('2026-01-01T02:00:00Z'),
    slaDueAt: new Date('2026-01-01T01:00:00Z'),
    escalationLevel: 1,
    ...over,
  };
}

describe('ReportsService.toCsvRow', () => {
  const svc = new ReportsService({} as PrismaService);

  it('calcula time_to_resolve_minutes y sla_breached, escapa el title', () => {
    const line = svc.toCsvRow(makeRow() as never);
    // 2h = 120 min; resolvedAt(02:00) > slaDueAt(01:00) → breached true
    expect(line).toContain(',120,');
    expect(line.trimEnd().endsWith(',true')).toBe(true);
    expect(line).toContain('"Título con, coma"');
  });

  it('sla_breached=false cuando se resolvió dentro del SLA', () => {
    const line = svc.toCsvRow(makeRow({ slaDueAt: new Date('2026-01-01T03:00:00Z') }) as never);
    expect(line.trimEnd().endsWith(',false')).toBe(true);
  });
});

describe('ReportsService.streamCsv', () => {
  it('emite header + filas paginando por cursor', async () => {
    const prisma = { ticket: { findMany: jest.fn() } } as unknown as PrismaService;
    (prisma.ticket.findMany as jest.Mock)
      .mockResolvedValueOnce([makeRow({ id: 't1' })]) // 1 < BATCH → corta
      .mockResolvedValue([]);
    const svc = new ReportsService(prisma);

    const lines: string[] = [];
    for await (const l of svc.streamCsv({})) lines.push(l);

    expect(lines[0]).toContain('ticket_number,type,title');
    expect(lines).toHaveLength(2); // header + 1 fila
    const where = (prisma.ticket.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.status).toBe('resuelto');
  });
});
