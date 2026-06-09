import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Role, TicketStatus, User } from '@prisma/client';

import { TicketsService } from './tickets.service';
import { PrismaService } from '@/prisma/prisma.service';
import { UsersService } from '@/users/users.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

const reporter = { id: 'u1', role: Role.reportante } as User;
const agent = { id: 'ag', role: Role.agente } as User;
const admin = { id: 'ad', role: Role.administrador } as User;

const dto: CreateTicketDto = {
  type: 'incidente',
  title: 'Falla del servicio de pagos',
  description: 'El servicio responde 500 desde las 9am afectando a todos los clientes.',
  severity: 4,
  impact: 4,
};

function setup() {
  const txTicketCreate = jest.fn();
  const txEventCreate = jest.fn();
  const prisma = {
    ticket: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    slaRule: { findUnique: jest.fn() },
    ticketEvent: { create: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ ticket: { create: txTicketCreate }, ticketEvent: { create: txEventCreate } }),
    ),
  } as unknown as PrismaService;
  const users = { findById: jest.fn() } as unknown as UsersService;
  const svc = new TicketsService(prisma, users);
  return { svc, prisma, users, txTicketCreate, txEventCreate };
}

describe('TicketsService.create', () => {
  it('crea ticket + evento, calcula prioridad y sla_due_at', async () => {
    const { svc, prisma, txTicketCreate, txEventCreate } = setup();
    (prisma.slaRule.findUnique as jest.Mock).mockResolvedValue({ timeToResolveMinutes: 60 });
    txTicketCreate.mockResolvedValue({ id: 't1', ticketNumber: 'TKT-0001' });

    const res = await svc.create(dto, reporter);
    expect(res.created).toBe(true);
    const data = txTicketCreate.mock.calls[0][0].data;
    expect(data.priority).toBe('critica');
    expect(data.reporterId).toBe('u1');
    expect(data.slaDueAt).toBeInstanceOf(Date);
    expect(txEventCreate).toHaveBeenCalledTimes(1);
  });

  it('Idempotency-Key existente no duplica', async () => {
    const { svc, prisma, txTicketCreate } = setup();
    (prisma.ticket.findFirst as jest.Mock).mockResolvedValue({ id: 't9' });
    const res = await svc.create(dto, reporter, 'k1');
    expect(res.created).toBe(false);
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it('carrera P2002 devuelve el existente', async () => {
    const { svc, prisma } = setup();
    (prisma.slaRule.findUnique as jest.Mock).mockResolvedValue({ timeToResolveMinutes: 60 });
    (prisma.ticket.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 't5' });
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }),
    );
    const res = await svc.create(dto, reporter, 'kx');
    expect(res.created).toBe(false);
    expect(res.ticket.id).toBe('t5');
  });
});

describe('TicketsService.getForUser', () => {
  it('404 si no existe', async () => {
    const { svc, prisma } = setup();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(svc.getForUser('x', reporter)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('reportante ajeno → 404', async () => {
    const { svc, prisma } = setup();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ id: 't1', reporterId: 'otro' });
    await expect(svc.getForUser('t1', reporter)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TicketsService.assign', () => {
  it('asigna con version correcta y registra evento', async () => {
    const { svc, prisma, users } = setup();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      id: 't1',
      assigneeId: null,
      version: 0,
    });
    (users.findById as jest.Mock).mockResolvedValue({ id: 'ag', role: Role.agente });
    (prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.ticket.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 't1',
      assigneeId: 'ag',
    });

    const r = await svc.assign('t1', { assigneeId: 'ag', expectedVersion: 0 }, admin);
    expect(r.assigneeId).toBe('ag');
    expect(prisma.ticketEvent.create).toHaveBeenCalled();
  });

  it('422 si el assignee no es agente/admin', async () => {
    const { svc, prisma, users } = setup();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ id: 't1', version: 0 });
    (users.findById as jest.Mock).mockResolvedValue({ id: 'r', role: Role.reportante });
    await expect(
      svc.assign('t1', { assigneeId: 'r', expectedVersion: 0 }, admin),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('409 si la version no coincide', async () => {
    const { svc, prisma, users } = setup();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ id: 't1', version: 3 });
    (users.findById as jest.Mock).mockResolvedValue({ id: 'ag', role: Role.agente });
    (prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    await expect(
      svc.assign('t1', { assigneeId: 'ag', expectedVersion: 0 }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('TicketsService.changeState', () => {
  const openAssigned = { id: 't1', status: TicketStatus.abierto, assigneeId: 'ag', version: 0 };

  it('inicia trabajo (abierto→en_progreso) por el assignee', async () => {
    const { svc, prisma } = setup();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(openAssigned);
    (prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.ticket.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      ...openAssigned,
      status: 'en_progreso',
    });
    const r = await svc.changeState(
      't1',
      { targetState: 'en_progreso', expectedVersion: 0 },
      agent,
    );
    expect(r.status).toBe('en_progreso');
  });

  it('resolver sin root_cause/solution → 400', async () => {
    const { svc, prisma } = setup();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      ...openAssigned,
      status: 'en_progreso',
    });
    await expect(
      svc.changeState('t1', { targetState: 'resuelto', expectedVersion: 0 }, agent),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no-assignee ni admin → 403', async () => {
    const { svc, prisma } = setup();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      ...openAssigned,
      assigneeId: 'otro',
    });
    await expect(
      svc.changeState('t1', { targetState: 'en_progreso', expectedVersion: 0 }, agent),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('transición inválida → 422', async () => {
    const { svc, prisma } = setup();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      ...openAssigned,
      status: 'resuelto',
    });
    await expect(
      svc.changeState('t1', { targetState: 'en_progreso', expectedVersion: 0 }, admin),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('409 si la version cambió', async () => {
    const { svc, prisma } = setup();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(openAssigned);
    (prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    await expect(
      svc.changeState('t1', { targetState: 'en_progreso', expectedVersion: 0 }, agent),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
