import { EventType, PrismaClient, Role, SlaRule } from '@prisma/client';

const MAX_LEVEL = 2;

/**
 * Decide el nivel de escalamiento objetivo según el tiempo transcurrido desde
 * la creación vs los umbrales del SLA (función pura, BL-030).
 */
export function decideEscalationLevel(elapsedMinutes: number, rule: SlaRule): number {
  if (elapsedMinutes >= rule.escalationL2Minutes) return 2;
  if (elapsedMinutes >= rule.escalationL1Minutes) return 1;
  return 0;
}

/**
 * Servicio del worker de escalamiento por SLA (EP-11). Agnóstico al trigger
 * (lo invoca EventBridge Scheduler — ver ADR 0006). El UPDATE es idempotente:
 * el guard `escalation_level = currentLevel` hace que disparos duplicados/
 * concurrentes afecten 0 filas y se salten el ticket (BL-030).
 *
 * BL-031 (recalcular sla_due_at + encolar notificación) queda pendiente porque
 * requiere la cola SQS (bloqueado por BL-114).
 */
export class EscalationService {
  constructor(private readonly prisma: PrismaClient) {}

  async sweep(now: Date = new Date()): Promise<{ scanned: number; escalated: number }> {
    const systemActorId = await this.getSystemActorId();
    const candidates = await this.prisma.ticket.findMany({
      where: { status: { not: 'resuelto' }, escalationLevel: { lt: MAX_LEVEL } },
    });

    let escalated = 0;
    for (const t of candidates) {
      const rule = await this.prisma.slaRule.findUnique({ where: { priority: t.priority } });
      if (!rule) continue;
      const elapsed = (now.getTime() - t.createdAt.getTime()) / 60000;
      const target = decideEscalationLevel(elapsed, rule);
      if (target > t.escalationLevel) {
        if (await this.escalateOne(t.id, t.escalationLevel, target, systemActorId)) {
          escalated++;
        }
      }
    }
    return { scanned: candidates.length, escalated };
  }

  /** Compare-and-set idempotente sobre escalation_level + evento `escalamiento`. */
  async escalateOne(
    ticketId: string,
    currentLevel: number,
    targetLevel: number,
    systemActorId: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.ticket.updateMany({
      where: { id: ticketId, escalationLevel: currentLevel, status: { not: 'resuelto' } },
      data: { escalationLevel: targetLevel },
    });
    if (count !== 1) {
      return false; // ya escalado por otra corrida (idempotente)
    }
    await this.prisma.ticketEvent.create({
      data: {
        ticketId,
        actorId: systemActorId,
        eventType: EventType.escalamiento,
        payload: { from_level: currentLevel, to_level: targetLevel },
      },
    });
    return true;
  }

  /** Usuario de sistema (actor de los eventos automáticos). Upsert idempotente. */
  private async getSystemActorId(): Promise<string> {
    const user = await this.prisma.user.upsert({
      where: { email: 'system@ticket-system.dev' },
      update: {},
      create: { email: 'system@ticket-system.dev', role: Role.administrador },
    });
    return user.id;
  }
}
