import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Ticket, User, EventType } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { requireOwnTicket } from '@/auth/ownership';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { calculatePriority } from './priority';

const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CreateResult {
  ticket: Ticket;
  created: boolean; // false cuando se resolvió por Idempotency-Key existente
}

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const slaDueAt = sla
      ? new Date(Date.now() + sla.timeToResolveMinutes * 60_000)
      : null;

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

  /** Obtiene un ticket aplicando ownership (reportante solo los propios → 404). */
  async getForUser(id: string, user: User): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }
    requireOwnTicket(ticket, user);
    return ticket;
  }
}
