import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { NotificationsService } from './notifications.service';

/**
 * NotificationsController — HTTP producer for the async notification queue
 * (Delivery 4, Deliverable E).
 *
 * POST /v1/notifications/enqueue
 *   Accepts an arbitrary JSON payload and enqueues it to the SQS queue
 *   identified by SQS_QUEUE_URL. Returns HTTP 202 Accepted with the SQS
 *   MessageId so callers can correlate the enqueued message with the
 *   consumer's processing log.
 *
 * Auth: protected by the global JwtAuthGuard (requires a valid Bearer token).
 * IAM:  the pod's IRSA role grants sqs:SendMessage on the specific queue ARN.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('enqueue')
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueue(@Body() body: Record<string, unknown>): Promise<{
    status: string;
    messageId: string;
  }> {
    const result = await this.notificationsService.enqueue(body);
    return {
      status: 'accepted',
      messageId: result.messageId,
    };
  }
}
