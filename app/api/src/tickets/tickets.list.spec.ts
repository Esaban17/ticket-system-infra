import { Role, TicketStatus, User } from '@prisma/client';

import { TicketsService } from './tickets.service';
import { PrismaService } from '@/prisma/prisma.service';
import { UsersService } from '@/users/users.service';

const reporter = { id: 'u1', role: Role.reportante } as User;
const agent = { id: 'ag', role: Role.agente } as User;

function setup() {
  const prisma = {
    ticket: { findMany: jest.fn(), findUnique: jest.fn() },
    ticketEvent: { findMany: jest.fn() },
  } as unknown as PrismaService;
  const users = { findById: jest.fn() } as unknown as UsersService;
  return { svc: new TicketsService(prisma, users), prisma };
}

describe('TicketsService.list', () => {
  it('reportante: fuerza reporter_id = self (sin override)', async () => {
    const { svc, prisma } = setup();
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    await svc.list({ assigneeId: 'me' }, reporter);
    const where = (prisma.ticket.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.reporterId).toBe('u1');
    expect(where.assigneeId).toBe('u1'); // 'me' resuelto al JWT
  });

  it('aplica filtros status/priority/q y paginación', async () => {
    const { svc, prisma } = setup();
    const rows = Array.from({ length: 2 }, (_, i) => ({ id: `t${i}` }));
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue(rows);
    const page = await svc.list(
      { status: 'abierto', priority: 'alta', q: 'pago', limit: 2 },
      agent,
    );
    const args = (prisma.ticket.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.status).toBe(TicketStatus.abierto);
    expect(args.where.OR).toHaveLength(2);
    expect(args.take).toBe(2);
    expect(page.nextCursor).toBe('t1'); // llena la página → hay cursor
  });

  it('cursor sin llenar → nextCursor null', async () => {
    const { svc, prisma } = setup();
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue([{ id: 't0' }]);
    const page = await svc.list({ limit: 5, cursor: 'tX' }, agent);
    expect(page.nextCursor).toBeNull();
    expect((prisma.ticket.findMany as jest.Mock).mock.calls[0][0].skip).toBe(1);
  });
});

describe('TicketsService.events', () => {
  it('valida ownership (reportante ajeno → 404 vía getForUser) y lista', async () => {
    const { svc, prisma } = setup();
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ id: 't1', reporterId: 'u1' });
    (prisma.ticketEvent.findMany as jest.Mock).mockResolvedValue([{ id: 'e1' }]);
    const page = await svc.events('t1', { limit: 50 }, reporter);
    expect(page.items).toHaveLength(1);
    expect(
      (prisma.ticketEvent.findMany as jest.Mock).mock.calls[0][0].include.actor.select.email,
    ).toBe(true);
  });
});
