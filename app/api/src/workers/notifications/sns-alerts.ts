import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

/**
 * Publicador de alertas operativas vía Amazon SNS.
 *
 * Complementa a SES: SES es el canal de NOTIFICACIÓN al usuario (camino feliz);
 * SNS es el canal de ALERTA al equipo de operaciones cuando algo falla en el
 * procesamiento asíncrono (un mensaje que no se pudo procesar y acabará en la
 * DLQ). El topic (`SNS_ALERTS_TOPIC_ARN`) es el mismo que reciben las alarmas de
 * CloudWatch, de modo que ops tiene un único punto de entrada para incidentes.
 *
 * El envío es best-effort: si SNS falla, se registra pero NO se relanza, para no
 * convertir un fallo de alertado en un fallo de procesamiento del worker.
 */

let cachedClient: SNSClient | undefined;
let cachedRegion: string | undefined;

function getClient(region: string): SNSClient {
  if (!cachedClient || cachedRegion !== region) {
    cachedClient = new SNSClient({ region });
    cachedRegion = region;
  }
  return cachedClient;
}

export interface OpsAlert {
  subject: string;
  /** Cuerpo legible de la alerta. */
  message: string;
  /** Atributos estructurados que se serializan dentro del mensaje. */
  context?: Record<string, unknown>;
}

export interface SnsAlertsOptions {
  /** ARN del topic. Default: process.env.SNS_ALERTS_TOPIC_ARN. */
  topicArn?: string;
  /** Región AWS. Default: process.env.AWS_REGION ?? 'us-east-1'. */
  region?: string;
}

/**
 * Publica una alerta operativa al topic SNS. Best-effort.
 * @returns el MessageId de SNS, o null si no hay topic configurado o SNS falló.
 */
export async function publishOpsAlert(
  alert: OpsAlert,
  options: SnsAlertsOptions = {},
): Promise<string | null> {
  const topicArn = options.topicArn ?? process.env.SNS_ALERTS_TOPIC_ARN;
  const region = options.region ?? process.env.AWS_REGION ?? 'us-east-1';

  if (!topicArn) {
    // SNS no configurado (p.ej. en local): no es un error, simplemente no se alerta.
    return null;
  }

  const payload = alert.context
    ? `${alert.message}\n\n${JSON.stringify(alert.context, null, 2)}`
    : alert.message;

  try {
    const result = await getClient(region).send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: alert.subject.slice(0, 100), // SNS limita el Subject a 100 chars
        Message: payload,
      }),
    );
    return result.MessageId ?? null;
  } catch (err) {
    // No relanzar: el alertado es secundario al procesamiento del mensaje.
    console.error(JSON.stringify({ event: 'sns_publish_error', error: String(err), topicArn }));
    return null;
  }
}

/** Sólo para pruebas: descarta el cliente cacheado. */
export function __resetSnsClientForTests(): void {
  cachedClient = undefined;
  cachedRegion = undefined;
}
