import { PrismaClient } from '@prisma/client';

import { EscalationService } from './escalation.service';

/**
 * Handler del Lambda de escalamiento SLA (BL-029), agnóstico al trigger.
 * Lo invoca EventBridge Scheduler en cadencia fija (ADR 0006). Hace un barrido
 * idempotente de tickets vencidos y devuelve el resumen.
 */
export async function handler(): Promise<{ scanned: number; escalated: number }> {
  const prisma = new PrismaClient();
  try {
    return await new EscalationService(prisma).sweep();
  } finally {
    await prisma.$disconnect();
  }
}
