import { Logger } from '@nestjs/common';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

import { EmailContent } from './templates/templates';

/**
 * Envío a los proveedores (BL-035 / EP-12, BL-119).
 *
 * Email: envío REAL vía Amazon SES cuando SES_FROM_ADDRESS está configurado.
 * Las credenciales las provee IRSA en el pod (el SDK las toma del entorno),
 * igual que en s3-presign.service. Si SES_FROM_ADDRESS NO está seteado (local
 * o tests), conserva el comportamiento stub (solo loguea la intención) para no
 * romper el flujo end-to-end ni exigir una identidad SES verificada.
 *
 * Slack: sigue en stub (requiere webhook BL-121).
 */
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);
  private readonly fromAddress = process.env.SES_FROM_ADDRESS ?? '';
  private readonly ses = new SESClient({ region: process.env.AWS_REGION });

  async sendEmail(to: string, content: EmailContent): Promise<void> {
    // Sin identidad SES verificada (local/tests): conserva el stub para no romper.
    if (!this.fromAddress) {
      this.logger.log(`[stub] email → ${to}: ${content.subject}`);
      return;
    }

    await this.ses.send(
      new SendEmailCommand({
        Source: this.fromAddress,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: content.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: content.body, Charset: 'UTF-8' } },
        },
      }),
    );
    this.logger.log(`email enviado → ${to}: ${content.subject}`);
  }

  async sendSlack(slackUserId: string, content: { text: string }): Promise<void> {
    this.logger.log(`[stub] slack → ${slackUserId}: ${content.text}`);
    return Promise.resolve();
  }
}
