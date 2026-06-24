import { Response } from 'express';
import { Role, User } from '@prisma/client';

import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

const user = { id: 'u1', role: Role.reportante } as User;
const dto = {
  type: 'incidente',
  title: 'x'.repeat(6),
  description: 'y'.repeat(25),
  severity: 2,
  impact: 2,
} as CreateTicketDto;

function res() {
  const r = { status: jest.fn(), setHeader: jest.fn() };
  r.status.mockReturnValue(r);
  return r as unknown as Response;
}

describe('TicketsController', () => {
  const service = {
    create: jest.fn(),
    getForUser: jest.fn(),
    addComment: jest.fn(),
  } as unknown as TicketsService;
  const controller = new TicketsController(service);
  afterEach(() => jest.clearAllMocks());

  it('POST nuevo → 201 + Location', async () => {
    const ticket = { id: 't1', ticketNumber: 'TKT-0001' };
    (service.create as jest.Mock).mockResolvedValue({ ticket, created: true });
    const r = res();
    await controller.create(dto, user, r, undefined);
    expect(service.create).toHaveBeenCalledWith(dto, user, undefined);
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.setHeader).toHaveBeenCalledWith('Location', '/v1/tickets/TKT-0001');
  });

  it('POST idempotente → 200', async () => {
    const ticket = { id: 't1', ticketNumber: 'TKT-0001' };
    (service.create as jest.Mock).mockResolvedValue({ ticket, created: false });
    const r = res();
    await controller.create(dto, user, r, 'key-1');
    expect(service.create).toHaveBeenCalledWith(dto, user, 'key-1');
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it('GET delega a getForUser', () => {
    (service.getForUser as jest.Mock).mockResolvedValue({ id: 't1' });
    void controller.getOne('t1', user);
    expect(service.getForUser).toHaveBeenCalledWith('t1', user);
  });

  it('POST comments delega a addComment con (id, user, message)', async () => {
    (service.addComment as jest.Mock).mockResolvedValue({ id: 'ev1' });
    const r = await controller.addComment('t1', { message: 'hola' }, user);
    expect(service.addComment).toHaveBeenCalledWith('t1', user, 'hola');
    expect(r).toEqual({ id: 'ev1' });
  });
});
