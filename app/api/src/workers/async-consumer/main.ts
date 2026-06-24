/**
 * Async Consumer — standalone SQS polling worker (Delivery 4, Deliverable E).
 *
 * Entry point for the consumer Kubernetes Deployment:
 *   command: ["node", "dist/workers/async-consumer/main.js"]
 *
 * For each SQS message:
 *   1. Receive (long-poll, up to POLLING_BATCH_SIZE messages per call)
 *   2. Write one S3 object (key = messageId) to the attachments bucket
 *   3. Log the messageId (evidence for Deliverable E)
 *   4. Delete the message from the queue
 *
 * IAM (IRSA, consumer ServiceAccount):
 *   - sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes on queue ARN
 *   - s3:PutObject on <bucket>/* (no wildcard ARN — rubric requirement)
 *
 * Environment variables (injected via Kubernetes ConfigMap):
 *   SQS_QUEUE_URL              — URL of the main SQS queue
 *   AWS_S3_BUCKET_ATTACHMENTS  — name of the S3 bucket
 *   AWS_REGION                 — AWS region (default: us-east-1)
 *   POLLING_BATCH_SIZE         — max messages per ReceiveMessage call (default: 10)
 */

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { DispatchService } from '../notifications/dispatch.service';
import { isTicketNotification } from '../notifications/ticket-notification';

// ---- Configuration ----------------------------------------------------------

const QUEUE_URL = process.env.SQS_QUEUE_URL ?? '';
const BUCKET = process.env.AWS_S3_BUCKET_ATTACHMENTS ?? '';
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const BATCH_SIZE = parseInt(process.env.POLLING_BATCH_SIZE ?? '10', 10);
const WAIT_TIME_SECONDS = 20; // long-polling duration
const POLL_INTERVAL_MS = 1000; // pause between empty polls

// ---- AWS clients ------------------------------------------------------------

const sqsClient = new SQSClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });
const dispatch = new DispatchService();

// ---- Main polling loop ------------------------------------------------------

/**
 * Procesa un mensaje de notificación de ticket (EP-12 / BL-119): envía un correo
 * REAL al reportante vía SES (DispatchService). El mensaje es autocontenido
 * (recipientEmail/subject/body resueltos por el productor), así que el consumer
 * no necesita la BD. El reportante recibe email solo porque el productor ya
 * resolvió el canal según sus preferencias (channel-resolver).
 */
async function processTicketNotification(
  messageId: string,
  payload: {
    type: string;
    ticketId: string;
    recipientEmail: string;
    subject: string;
    body: string;
  },
): Promise<void> {
  await dispatch.sendEmail(payload.recipientEmail, {
    subject: payload.subject,
    body: payload.body,
  });

  console.log(
    JSON.stringify({
      event: 'notification_sent',
      messageId,
      type: payload.type,
      ticketId: payload.ticketId,
    }),
  );
}

async function processMessage(messageId: string, body: string): Promise<void> {
  // Routing por 'type': los mensajes de notificación de ticket disparan un
  // correo; cualquier otro mensaje conserva el flujo existente de S3 (D4).
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }

  if (isTicketNotification(parsed)) {
    await processTicketNotification(messageId, parsed);
    return;
  }

  const key = `async/${messageId}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    }),
  );

  // Log the messageId — required evidence for Deliverable E.
  console.log(
    JSON.stringify({
      event: 'message_processed',
      messageId,
      s3Key: key,
      bucket: BUCKET,
    }),
  );
}

async function poll(): Promise<void> {
  if (!QUEUE_URL) {
    console.error('SQS_QUEUE_URL is not set — exiting');
    process.exit(1);
  }
  if (!BUCKET) {
    console.error('AWS_S3_BUCKET_ATTACHMENTS is not set — exiting');
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      event: 'consumer_started',
      queueUrl: QUEUE_URL,
      bucket: BUCKET,
      region: REGION,
      batchSize: BATCH_SIZE,
    }),
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let messages: Array<{ MessageId?: string; ReceiptHandle?: string; Body?: string }> = [];

    try {
      const response = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: BATCH_SIZE,
          WaitTimeSeconds: WAIT_TIME_SECONDS,
        }),
      );
      messages = response.Messages ?? [];
    } catch (err) {
      console.error(JSON.stringify({ event: 'receive_error', error: String(err) }));
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (messages.length === 0) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    for (const msg of messages) {
      const messageId = msg.MessageId ?? 'unknown';
      const body = msg.Body ?? '{}';
      const receiptHandle = msg.ReceiptHandle ?? '';

      try {
        await processMessage(messageId, body);

        // Delete only after successful S3 write to avoid message loss.
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: receiptHandle,
          }),
        );
      } catch (err) {
        // Leave the message in the queue — SQS will redeliver after
        // visibility timeout. After maxReceiveCount attempts it moves to DLQ.
        console.error(JSON.stringify({ event: 'processing_error', messageId, error: String(err) }));
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Entrypoint -------------------------------------------------------------

poll().catch((err) => {
  console.error(JSON.stringify({ event: 'fatal_error', error: String(err) }));
  process.exit(1);
});
