import { Logger } from '@nestjs/common';

import { EmailContent } from './templates/templates';

/**
 * Envío a los proveedores (BL-035). El envío REAL con manejo de errores
 * transitorios/permanentes de SES y Slack queda BLOQUEADO: requiere una
 * identidad SES verificada (Q1 / BL-119) y un webhook de Slack (BL-121). Por
 * ahora registra la intención para validar el flujo end-to-end del worker.
 */
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  async sendEmail(to: string, content: EmailContent): Promise<void> {
    this.logger.log(`[stub] email → ${to}: ${content.subject}`);
    return Promise.resolve();
  }

  async sendSlack(slackUserId: string, content: { text: string }): Promise<void> {
    this.logger.log(`[stub] slack → ${slackUserId}: ${content.text}`);
    return Promise.resolve();
  }
}
