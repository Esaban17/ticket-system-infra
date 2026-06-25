import { Logger } from '@nestjs/common';

import { EmailContent } from './templates/templates';
import { sendEmailViaSes } from './ses-mailer';

/**
 * Envío a los proveedores (BL-035).
 *
 * `sendEmail` ahora envía REALMENTE por Amazon SES (identidad de dominio
 * `quattro.com.gt` verificada; cuenta en modo producción). El remitente se toma
 * de `SES_FROM_ADDRESS`. Si SES rechaza el envío, se relanza el error para que
 * el worker reintente (en el consumer eso deja el mensaje en SQS → DLQ).
 *
 * `sendSlack` sigue como stub: el webhook de Slack (BL-121) queda fuera de
 * alcance de esta entrega; Slack se documentó como extensión futura.
 */
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  async sendEmail(to: string, content: EmailContent): Promise<void> {
    const messageId = await sendEmailViaSes({
      to,
      subject: content.subject,
      text: content.body,
    });
    this.logger.log(JSON.stringify({ event: 'email_sent', channel: 'ses', to, messageId }));
  }

  async sendSlack(slackUserId: string, content: { text: string }): Promise<void> {
    this.logger.log(`[stub] slack → ${slackUserId}: ${content.text}`);
    return Promise.resolve();
  }
}
