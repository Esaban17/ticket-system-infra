import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { User } from '@prisma/client';

import { CurrentUser } from '@/auth/current-user.decorator';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

/**
 * Endpoints de tickets (EP-03). Requieren JWT (el guard global de EP-07 aplica;
 * este controller ya NO es @Public). La cola/filtros llegan en EP-05 y las
 * transiciones de estado en EP-04.
 */
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  // POST /v1/tickets — crea un ticket. 201 + Location; 200 si Idempotency-Key repetido.
  @Post()
  async create(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const { ticket, created } = await this.tickets.create(dto, user, idempotencyKey);
    res.status(created ? 201 : 200);
    res.setHeader('Location', `/v1/tickets/${ticket.ticketNumber}`);
    return ticket;
  }

  // GET /v1/tickets/:id — un ticket (ownership: reportante solo los suyos → 404).
  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: User) {
    return this.tickets.getForUser(id, user);
  }
}
