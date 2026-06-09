import { NotFoundException } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';

import { TicketsService } from './tickets.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

const user = { id: 'u1', role: Role.reportante } as User;
const dto: CreateTicketDto = {
  type: 'incidente',
  title: 'Falla del servicio de pagos',
  description: 'El servicio responde 500 desde las 9am afectando a todos los clientes.',
  severity: 4,
  impact: 4,
};

function makePrisma() {
  const txTicketCreate = jest.fn();
  const txEventCreate = jest.fn();
  const prisma = {
    ticket: { findFirst: jest.fn(), findUnique: jest.fn() },
    slaRule: { findUnique: jest.fn() },
    ticketEvent: { create: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ ticket: { create: txTicketCreate }, ticketEvent: { create: txEventCreate } }),
    ),
  } as unknown as PrismaService;
  return { prisma, txTicketCreate, txEventCreate };
}

describe('TicketsService.create', () => {
  it('crea ticket + evento, calcula prioridad y sla_due_at', async () => {
    const { prisma, txTicketCreate, txEventCreate } = makePrisma();
    (prisma.slaRule.findUnique as jest.Mock).mockResolvedValue({ timeToResolveMinutes: 60, priority: 'critica' });
    const fake = { id: 't1', ticketNumber: 'TKT-0001', priority: 'critica' };
    txTicketCreate.mockResolvedValue(fake);

    const svc = new TicketsService(prisma);
    const res = await svc.create(dto, user);

    expect(res.created).toBe(true);
    expect(res.ticket).toBe(fake);
    // prioridad critica (4+4=8); reporter = usuario actual; sla_due_at seteado
    const data = txTicketCreate.mock.calls[0][0].data;
    expect(data.priority).toBe('critica');
    expect(data.reporterId).toBe('u1');
    expect(data.slaDueAt).toBeInstanceOf(Date);
    expect(txEventCreate).toHaveBeenCalledTimes(1);
  });

  it('Idempotency-Key existente devuelve el ticket sin duplicar (created=false)', async () => {
    const { prisma, txTicketCreate } = makePrisma();
    (prisma.ticket.findFirst as jest.Mock).mockResolvedValue({ id: 't9', ticketNumber: 'TKT-0009' });

    const svc = new TicketsService(prisma);
    const res = await svc.create(dto, user, 'key-123');

    expect(res.created).toBe(false);
    expect(res.ticket.id).toBe('t9');
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it('carrera P2002 con el mismo key devuelve el existente', async () => {
    const { prisma } = makePrisma();
    (prisma.slaRule.findUnique as jest.Mock).mockResolvedValue({ timeToResolveMinutes: 60 });
    (prisma.ticket.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // chequeo inicial
      .mockResolvedValueOnce({ id: 't5' }); // tras el conflicto
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }),
    );

    const svc = new TicketsService(prisma);
    const res = await svc.create(dto, user, 'key-x');
    expect(res.created).toBe(false);
    expect(res.ticket.id).toBe('t5');
  });
});

describe('TicketsService.getForUser', () => {
  it('404 si no existe', async () => {
    const { prisma } = makePrisma();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(new TicketsService(prisma).getForUser('x', user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reportante no puede ver ticket ajeno (404)', async () => {
    const { prisma } = makePrisma();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ id: 't1', reporterId: 'otro' });
    await expect(new TicketsService(prisma).getForUser('t1', user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('agente puede ver cualquiera', async () => {
    const { prisma } = makePrisma();
    const t = { id: 't1', reporterId: 'otro' };
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(t);
    await expect(
      new TicketsService(prisma).getForUser('t1', { id: 'a', role: Role.agente } as User),
    ).resolves.toBe(t);
  });
});
