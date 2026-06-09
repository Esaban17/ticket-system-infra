import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Role, Ticket, TicketStatus, User, EventType } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { UsersService } from '@/users/users.service';
import { requireOwnTicket } from '@/auth/ownership';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ChangeStateDto } from './dto/change-state.dto';
import { ListTicketsQuery, ListEventsQuery } from './dto/list-tickets.query';
import { calculatePriority } from './priority';
import { canTransition } from './state-machine';

const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 20;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CreateResult {
  ticket: Ticket;
  created: boolean; // false cuando se resolvió por Idempotency-Key existente
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /**
   * Crea un ticket (BL-014): valida (DTO), calcula prioridad, lee el SLA por
   * prioridad, calcula sla_due_at, persiste ticket + evento `ticket_creado` en
   * una transacción. Si llega `idempotencyKey`, no duplica dentro de 24h.
   * El reportante siempre se crea como su propio `reporter_id`.
   */
  async create(dto: CreateTicketDto, user: User, idempotencyKey?: string): Promise<CreateResult> {
    if (idempotencyKey) {
      const existing = await this.prisma.ticket.findFirst({
        where: {
          idempotencyKey,
          createdAt: { gt: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) },
        },
      });
      if (existing) {
        return { ticket: existing, created: false };
      }
    }

    const priority = calculatePriority(dto.severity, dto.impact);
    const sla = await this.prisma.slaRule.findUnique({ where: { priority } });
    const slaDueAt = sla ? new Date(Date.now() + sla.timeToResolveMinutes * 60_000) : null;

    try {
      const ticket = await this.prisma.$transaction(async (tx) => {
        const created = await tx.ticket.create({
          data: {
            type: dto.type,
            title: dto.title,
            description: dto.description,
            severity: dto.severity,
            impact: dto.impact,
            priority,
            reporterId: user.id,
            slaDueAt,
            idempotencyKey: idempotencyKey ?? null,
          },
        });
        await tx.ticketEvent.create({
          data: {
            ticketId: created.id,
            actorId: user.id,
            eventType: EventType.ticket_creado,
            payload: {
              ticket_number: created.ticketNumber,
              type: created.type,
              priority: created.priority,
              severity: created.severity,
              impact: created.impact,
            },
          },
        });
        return created;
      });
      return { ticket, created: true };
    } catch (err) {
      // Carrera con el mismo Idempotency-Key: el unique lo atrapa → devolver el existente.
      if (
        idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.ticket.findFirst({ where: { idempotencyKey } });
        if (existing) {
          return { ticket: existing, created: false };
        }
      }
      throw err;
    }
  }

  /**
   * Cola de tickets con filtros + búsqueda + paginación cursor (BL-023).
   * Reportante: filtro implícito reporter_id = self, sin override.
   * assignee_id='me' resuelve al usuario del JWT.
   */
  async list(query: ListTicketsQuery, user: User): Promise<Page<Ticket>> {
    const where: Prisma.TicketWhereInput = {};

    if (user.role === Role.reportante) {
      where.reporterId = user.id; // sin opción de override
    }
    if (query.status) where.status = query.status as TicketStatus;
    if (query.priority) where.priority = query.priority as Prisma.TicketWhereInput['priority'];
    if (query.severity) where.severity = query.severity;
    if (query.assigneeId) {
      where.assigneeId = query.assigneeId === 'me' ? user.id : query.assigneeId;
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
      };
    }
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const limit = query.limit ?? DEFAULT_LIMIT;
    const items = await this.prisma.ticket.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    return { items, nextCursor: items.length === limit ? items[items.length - 1].id : null };
  }

  /** Historial inmutable de un ticket con paginación cursor (BL-022). */
  async events(ticketId: string, query: ListEventsQuery, user: User): Promise<Page<unknown>> {
    await this.getForUser(ticketId, user); // valida existencia + ownership (404)

    const limit = query.limit ?? DEFAULT_LIMIT;
    const items = await this.prisma.ticketEvent.findMany({
      where: { ticketId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { actor: { select: { id: true, email: true, role: true } } },
    });
    return {
      items,
      nextCursor: items.length === limit ? items[items.length - 1].id : null,
    };
  }

  /** Obtiene un ticket aplicando ownership (reportante solo los propios → 404). */
  async getForUser(id: string, user: User): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }
    requireOwnTicket(ticket, user);
    return ticket;
  }

  /**
   * Asigna el ticket a un agente/admin (BL-018) con optimistic locking.
   * UPDATE ... WHERE id=? AND version=? ; 0 filas → 409 conflict-version.
   */
  async assign(id: string, dto: AssignTicketDto, actor: User): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }

    const assignee = await this.users.findById(dto.assigneeId);
    if (!assignee || assignee.role === Role.reportante) {
      throw new UnprocessableEntityException('El assignee debe ser un agente o administrador');
    }

    const { count } = await this.prisma.ticket.updateMany({
      where: { id, version: dto.expectedVersion },
      data: { assigneeId: dto.assigneeId, version: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictException({
        type: 'conflict-version',
        detail: 'El ticket cambió; refetch y reintenta',
      });
    }

    await this.prisma.ticketEvent.create({
      data: {
        ticketId: id,
        actorId: actor.id,
        eventType: EventType.asignacion,
        payload: { from_assignee_id: ticket.assigneeId, to_assignee_id: dto.assigneeId },
      },
    });
    return this.prisma.ticket.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Transición de estado con máquina de estados pura + optimistic locking (BL-019/020).
   * Para 'resuelto' exige root_cause + solution (400 antes de tocar BD) y setea resolved_at.
   */
  async changeState(id: string, dto: ChangeStateDto, actor: User): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }

    const next = dto.targetState as TicketStatus;

    if (next === TicketStatus.resuelto && (!dto.rootCause || !dto.solution)) {
      throw new BadRequestException('Resolver requiere root_cause y solution');
    }

    // Solo el assignee o un administrador pueden mover el ticket.
    const isAdmin = actor.role === Role.administrador;
    if (!isAdmin && ticket.assigneeId !== actor.id) {
      throw new ForbiddenException(
        'Solo el agente asignado o un administrador pueden cambiar el estado',
      );
    }

    if (next === TicketStatus.en_progreso && !ticket.assigneeId) {
      throw new UnprocessableEntityException({
        type: 'assignee-required',
        detail: 'El ticket no tiene assignee',
      });
    }

    const transition = canTransition(ticket.status, next, actor.role);
    if (!transition.ok) {
      throw new UnprocessableEntityException({
        type: 'invalid-transition',
        detail: transition.reason,
      });
    }

    const data: Prisma.TicketUpdateManyMutationInput = { status: next, version: { increment: 1 } };
    if (next === TicketStatus.resuelto) {
      data.resolvedAt = new Date();
      data.rootCause = dto.rootCause;
      data.solution = dto.solution;
    }

    const { count } = await this.prisma.ticket.updateMany({
      where: { id, version: dto.expectedVersion, status: ticket.status },
      data,
    });
    if (count === 0) {
      throw new ConflictException({
        type: 'conflict-version',
        detail: 'El ticket cambió; refetch y reintenta',
      });
    }

    await this.prisma.ticketEvent.create({
      data: {
        ticketId: id,
        actorId: actor.id,
        eventType: next === TicketStatus.resuelto ? EventType.resolucion : EventType.cambio_estado,
        payload:
          next === TicketStatus.resuelto
            ? {
                from_state: ticket.status,
                to_state: next,
                root_cause: dto.rootCause,
                solution: dto.solution,
                resolved_by: actor.id,
              }
            : { from_state: ticket.status, to_state: next },
      },
    });
    return this.prisma.ticket.findUniqueOrThrow({ where: { id } });
  }
}
