import { NotFoundException } from '@nestjs/common';
import { Role, Ticket, User } from '@prisma/client';

/**
 * Valida que un reportante solo acceda a SUS propios tickets (BL-028).
 * Agente/administrador pueden ver cualquier ticket.
 *
 * Lanza 404 (no 403) cuando un reportante pide un ticket ajeno: así no se
 * filtra la existencia de tickets de otros usuarios.
 */
export function requireOwnTicket(
  ticket: Pick<Ticket, 'reporterId'>,
  user: Pick<User, 'id' | 'role'>,
): void {
  if (user.role === Role.reportante && ticket.reporterId !== user.id) {
    throw new NotFoundException('Ticket no encontrado');
  }
}
