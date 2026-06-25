/**
 * Async Consumer — standalone SQS polling worker (Delivery 4, Deliverable E;
 * extendido en D5 con integración SES + SNS).
 *
 * Entry point for the consumer Kubernetes Deployment:
 *   command: ["node", "dist/workers/async-consumer/main.js"]
 *
 * For each SQS message:
 *   1. Receive (long-poll, up to POLLING_BATCH_SIZE messages per call)
 *   2. Write one S3 object (key = messageId) to the attachments bucket (evidencia)
 *   3. Si el mensaje es una NOTIFICACIÓN (trae `to` = email), enviarlo por
 *      Amazon SES (camino feliz). Backward-compatible: los payloads sin `to`
 *      (p.ej. los del runbook KEDA) sólo se escriben a S3, como antes.
 *   4. Log el messageId (evidencia)
 *   5. Delete the message from the queue
 *
 * Si el procesamiento falla y el mensaje ya agotó (casi) sus reintentos, se
 * publica una ALERTA operativa a Amazon SNS (canal de ops) antes de dejar que el
 * mensaje caiga a la DLQ.
 *
 * IAM (IRSA, consumer ServiceAccount):
 *   - sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes on queue ARN
 *   - s3:PutObject on <bucket>/* (no wildcard ARN — rubric requirement)
 *   - ses:SendEmail / ses:SendRawEmail scoped a la identidad verificada
 *   - sns:Publish scoped al topic de alertas
 *
 * Environment variables (injected via Kubernetes ConfigMap):
 *   SQS_QUEUE_URL              — URL of the main SQS queue
 *   AWS_S3_BUCKET_ATTACHMENTS  — name of the S3 bucket
 *   AWS_REGION                 — AWS region (default: us-east-1)
 *   POLLING_BATCH_SIZE         — max messages per ReceiveMessage call (default: 10)
 *   SES_FROM_ADDRESS           — remitente verificado para SES (opcional)
 *   SNS_ALERTS_TOPIC_ARN       — topic de alertas operativas (opcional)
 *   SNS_ALERT_AFTER_RECEIVES   — nº de entregas tras el cual alertar a SNS (default: 3)
 */

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { sendEmailViaSes } from '../notifications/ses-mailer';
import { publishOpsAlert } from '../notifications/sns-alerts';

// ---- Configuration ----------------------------------------------------------

const QUEUE_URL = process.env.SQS_QUEUE_URL ?? '';
const BUCKET = process.env.AWS_S3_BUCKET_ATTACHMENTS ?? '';
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const BATCH_SIZE = parseInt(process.env.POLLING_BATCH_SIZE ?? '10', 10);
const ALERT_AFTER_RECEIVES = parseInt(process.env.SNS_ALERT_AFTER_RECEIVES ?? '3', 10);
const WAIT_TIME_SECONDS = 20; // long-polling duration
const POLL_INTERVAL_MS = 1000; // pause between empty polls

// ---- AWS clients ------------------------------------------------------------

const sqsClient = new SQSClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });

// ---- Notification detection -------------------------------------------------

interface NotificationLike {
  to?: unknown;
  subject?: unknown;
  body?: unknown;
  eventType?: unknown;
  ticketNumber?: unknown;
  title?: unknown;
}

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Si el cuerpo es JSON con un `to` válido, construye el email a enviar. Devuelve
 * null para cualquier otro payload (no es una notificación → sólo S3).
 */
function buildEmail(body: string): { to: string; subject: string; text: string } | null {
  let parsed: NotificationLike;
  try {
    parsed = JSON.parse(body) as NotificationLike;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !isEmail(parsed.to)) {
    return null;
  }

  const ticketNumber = asString(parsed.ticketNumber);
  const title = asString(parsed.title);
  const eventType = asString(parsed.eventType) ?? 'notificación';

  const subject =
    asString(parsed.subject) ??
    (ticketNumber
      ? `[${ticketNumber}] ${title ?? 'Notificación de ticket'}`
      : 'Notificación — Sistema de Tickets');

  const text =
    asString(parsed.body) ??
    `Evento: ${eventType}\n${title ? `Ticket: ${title}\n` : ''}\nIngresa al sistema para ver el detalle.\n\n— Sistema de Tickets`;

  return { to: parsed.to, subject, text };
}

// ---- Main polling loop ------------------------------------------------------

async function processMessage(messageId: string, body: string): Promise<void> {
  const key = `async/${messageId}`;

  // 1. Persistir el mensaje en S3 (evidencia + auditoría). Idempotente por key.
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    }),
  );

  // 2. Si es una notificación con destinatario, enviar el correo por SES.
  const email = buildEmail(body);
  let sesMessageId: string | undefined;
  if (email) {
    sesMessageId = await sendEmailViaSes(email);
    console.log(
      JSON.stringify({
        event: 'email_sent',
        channel: 'ses',
        messageId,
        to: email.to,
        sesMessageId,
      }),
    );
  }

  // Log the messageId — required evidence for Deliverable E.
  console.log(
    JSON.stringify({
      event: 'message_processed',
      messageId,
      s3Key: key,
      bucket: BUCKET,
      emailed: Boolean(email),
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
      sesFrom: process.env.SES_FROM_ADDRESS ?? null,
      snsAlerts: process.env.SNS_ALERTS_TOPIC_ARN ?? null,
    }),
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let messages: Array<{
      MessageId?: string;
      ReceiptHandle?: string;
      Body?: string;
      Attributes?: Record<string, string>;
    }> = [];

    try {
      const response = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: BATCH_SIZE,
          WaitTimeSeconds: WAIT_TIME_SECONDS,
          // ApproximateReceiveCount permite alertar justo antes de la DLQ.
          MessageSystemAttributeNames: ['ApproximateReceiveCount'],
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
      const receiveCount = parseInt(msg.Attributes?.ApproximateReceiveCount ?? '1', 10);

      try {
        await processMessage(messageId, body);

        // Delete only after successful processing to avoid message loss.
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: receiptHandle,
          }),
        );
      } catch (err) {
        // Leave the message in the queue — SQS will redeliver after the
        // visibility timeout. After maxReceiveCount attempts it moves to DLQ.
        console.error(
          JSON.stringify({
            event: 'processing_error',
            messageId,
            receiveCount,
            error: String(err),
          }),
        );

        // Si el mensaje ya casi agotó sus reintentos, alertar a ops vía SNS
        // antes de que caiga a la DLQ (best-effort: no rompe el loop).
        if (receiveCount >= ALERT_AFTER_RECEIVES) {
          await publishOpsAlert({
            subject: `[ticket-system] Mensaje async fallando (${messageId})`,
            message:
              `Un mensaje de la cola async falló su procesamiento ${receiveCount} ` +
              `veces y está por moverse a la DLQ.`,
            context: { messageId, receiveCount, error: String(err), region: REGION },
          });
        }
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
