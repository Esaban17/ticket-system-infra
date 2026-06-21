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
})
export class NotificationsModule {}
