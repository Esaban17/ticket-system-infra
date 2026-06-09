import { PrismaClient } from '@prisma/client';

import { NotificationsService } from './notifications.service';
import { parseMessage } from './notification-message';

interface SqsRecord {
  body: string;
}
interface SqsEvent {
  Records?: SqsRecord[];
}

/**
 * Handler del worker SQS de notificaciones (BL-032). Itera los records del
 * batch, valida cada mensaje (zod) y delega al service. Un mensaje inválido se
 * descarta sin romper el batch (cuenta como `failed`).
 *
 * El commit/visibility correcto de SQS (BL-045) y el envío real (BL-035) se
 * completan cuando exista la cola SQS y la identidad SES/Slack.
 */
export async function handler(event: SqsEvent): Promise<{ processed: number; failed: number }> {
  const prisma = new PrismaClient();
  const service = new NotificationsService(prisma);
  let processed = 0;
  let failed = 0;
  try {
    for (const record of event.Records ?? []) {
      try {
        const msg = parseMessage(JSON.parse(record.body));
        await service.process(msg);
        processed++;
      } catch {
        failed++;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  return { processed, failed };
}
