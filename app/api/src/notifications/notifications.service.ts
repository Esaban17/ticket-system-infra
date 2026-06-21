import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

import { AppConfig } from '@/config/configuration';

export interface EnqueueResult {
  messageId: string;
  queueUrl: string;
}

/**
 * NotificationsService — producer for the async notification queue (Delivery 4,
 * Deliverable E). Sends a message to the SQS queue identified by the
 * SQS_QUEUE_URL env var (injected from the Kubernetes ConfigMap via Terraform).
 *
 * IAM: the pod's IRSA role grants sqs:SendMessage on the SPECIFIC queue ARN
 * (no static credentials, no wildcard resource — rubric requirement).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sqsClient: SQSClient;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const region = this.config.get('aws.region', { infer: true }) ?? 'us-east-1';
    this.sqsClient = new SQSClient({ region });
  }

  /**
   * Enqueue a notification payload to the SQS queue.
   *
   * @param body  Arbitrary JSON-serializable payload from the caller.
   * @returns     The SQS MessageId and the queue URL for traceability.
   * @throws      Error when SQS_QUEUE_URL is not configured or the send fails.
   */
  async enqueue(body: Record<string, unknown>): Promise<EnqueueResult> {
    const queueUrl = this.config.get('aws.sqs.queueUrl', { infer: true });

    if (!queueUrl) {
      this.logger.warn('SQS_QUEUE_URL not configured — skipping SQS send (local dev mode)');
      throw new Error('SQS_QUEUE_URL is not configured');
    }

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
    });

    const result = await this.sqsClient.send(command);

    const messageId = result.MessageId ?? 'unknown';
    this.logger.log(`Message enqueued: messageId=${messageId} queue=${queueUrl}`);

    return { messageId, queueUrl };
  }
}
