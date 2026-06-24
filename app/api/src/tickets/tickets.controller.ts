import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Role, User } from '@prisma/client';

import { CurrentUser } from '@/auth/current-user.decorator';
import { RequireRole } from '@/auth/roles.decorator';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ChangeStateDto } from './dto/change-state.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ListTicketsQuery, ListEventsQuery } from './dto/list-tickets.query';

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

  // GET /v1/tickets — cola con filtros + búsqueda + paginación cursor (BL-023).
  @Get()
  list(@Query() query: ListTicketsQuery, @CurrentUser() user: User) {
    return this.tickets.list(query, user);
  }

  // GET /v1/tickets/:id/events — historial inmutable, cursor (BL-022).
  @Get(':id/events')
  events(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListEventsQuery,
    @CurrentUser() user: User,
  ) {
    return this.tickets.events(id, query, user);
  }

  // GET /v1/tickets/:id — un ticket (ownership: reportante solo los suyos → 404).
  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: User) {
    return this.tickets.getForUser(id, user);
  }

  // POST /v1/tickets/:id/assign — asigna a un agente (BL-018). Reportante → 403 (RBAC).
  @Post(':id/assign')
  @RequireRole(Role.agente, Role.administrador)
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: User,
  ) {
    return this.tickets.assign(id, dto, user);
  }

  // PATCH /v1/tickets/:id/state — iniciar/resolver (BL-019/020). Reportante → 403.
  @Patch(':id/state')
  @RequireRole(Role.agente, Role.administrador)
  changeState(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeStateDto,
    @CurrentUser() user: User,
  ) {
    return this.tickets.changeState(id, dto, user);
  }

  // POST /v1/tickets/:id/comments — agrega un comentario (EP-13 / BL-120). 201 + evento.
  // RBAC: reportante (solo sus propios tickets, validado en el service), agente y admin.
  @Post(':id/comments')
  @HttpCode(201)
  addComment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: User,
  ) {
    return this.tickets.addComment(id, user, dto.message);
  }
}
