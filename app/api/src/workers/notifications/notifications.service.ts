import { PrismaClient } from '@prisma/client';

import { Channel, resolveChannels } from './channel-resolver.service';
import { renderEmail, renderSlack } from './templates/templates';
import { NotificationMessage } from './notification-message';
import { DispatchService } from './dispatch.service';

/**
 * Procesa un mensaje de notificación (EP-12): resuelve canales según las
 * preferencias del destinatario, renderiza el contenido y delega el envío.
 */
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly dispatch: DispatchService = new DispatchService(),
  ) {}

  async process(msg: NotificationMessage): Promise<{ channels: Channel[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: msg.recipientId } });
    if (!user) {
      return { channels: [] }; // destinatario inexistente: nada que enviar
    }

    const channels = resolveChannels(user);
    for (const channel of channels) {
      if (channel === 'email') {
        await this.dispatch.sendEmail(user.email, renderEmail(msg));
      } else if (user.slackUserId) {
        await this.dispatch.sendSlack(user.slackUserId, renderSlack(msg));
      }
    }
    return { channels };
  }
}
