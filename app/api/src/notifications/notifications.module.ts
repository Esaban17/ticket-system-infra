import { Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * NotificationsModule — wires the async notification producer (Delivery 4).
 *
 * Exposes: POST /v1/notifications/enqueue
 * Uses:    @aws-sdk/client-sqs via NotificationsService (IRSA credentials from
 *          the pod's service account annotation — no static AWS keys).
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  // Exportado para que TicketsService (EP-12 / BL-119) reuse el mismo productor
  // SQS al encolar notificaciones de ticket (resuelto/comentado/asignado).
  exports: [NotificationsService],
})
export class NotificationsModule {}
