import { PrismaClient, SlaRule } from '@prisma/client';

import { decideEscalationLevel, EscalationService } from './escalation.service';

const rule = { escalationL1Minutes: 60, escalationL2Minutes: 120 } as SlaRule;

describe('decideEscalationLevel', () => {
  it('0 antes del umbral L1', () => expect(decideEscalationLevel(30, rule)).toBe(0));
  it('1 entre L1 y L2', () => expect(decideEscalationLevel(90, rule)).toBe(1));
  it('2 después de L2', () => expect(decideEscalationLevel(120, rule)).toBe(2));
});

function makePrisma() {
  return {
    user: { upsert: jest.fn().mockResolvedValue({ id: 'sys' }) },
    ticket: { findMany: jest.fn(), updateMany: jest.fn() },
    slaRule: { findUnique: jest.fn() },
    ticketEvent: { create: jest.fn() },
  } as unknown as PrismaClient;
}

describe('EscalationService', () => {
  it('escalateOne: compare-and-set exitoso registra evento', async () => {
    const prisma = makePrisma();
    (prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const ok = await new EscalationService(prisma).escalateOne('t1', 0, 1, 'sys');
    expect(ok).toBe(true);
    expect(prisma.ticketEvent.create).toHaveBeenCalled();
    const where = (prisma.ticket.updateMany as jest.Mock).mock.calls[0][0].where;
    expect(where.escalationLevel).toBe(0); // guard idempotente
  });

  it('escalateOne: 0 filas (ya escalado) → no registra evento', async () => {
    const prisma = makePrisma();
    (prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const ok = await new EscalationService(prisma).escalateOne('t1', 0, 1, 'sys');
    expect(ok).toBe(false);
    expect(prisma.ticketEvent.create).not.toHaveBeenCalled();
  });

  it('sweep: escala los tickets vencidos según su regla', async () => {
    const prisma = makePrisma();
    const created = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-01T02:30:00Z'); // 150 min → nivel 2
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue([
      { id: 't1', priority: 'alta', escalationLevel: 0, createdAt: created },
    ]);
    (prisma.slaRule.findUnique as jest.Mock).mockResolvedValue(rule);
    (prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const res = await new EscalationService(prisma).sweep(now);
    expect(res).toEqual({ scanned: 1, escalated: 1 });
    expect((prisma.ticket.updateMany as jest.Mock).mock.calls[0][0].data.escalationLevel).toBe(2);
  });
});
