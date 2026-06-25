import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

/**
 * SES mailer (BL-035) — envío REAL de correo vía Amazon SES.
 *
 * Reemplaza el stub histórico: el bloqueo "requiere una identidad SES
 * verificada" quedó resuelto al verificarse el dominio `quattro.com.gt` en la
 * cuenta dev. El remitente (`SES_FROM_ADDRESS`) debe pertenecer a una identidad
 * verificada; el destinatario es libre porque la cuenta está en modo producción
 * (fuera del sandbox).
 *
 * Diseño:
 *   - Un único `SESClient` perezoso por proceso (reutilizado entre invocaciones).
 *   - `sendEmail` devuelve el `MessageId` de SES o lanza si el envío falla, para
 *     que el caller decida el reintento (en el consumer, relanzar deja el mensaje
 *     en SQS → DLQ tras maxReceiveCount).
 */

export interface SesEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SesMailerOptions {
  /** Remitente verificado. Default: process.env.SES_FROM_ADDRESS. */
  from?: string;
  /** Región AWS. Default: process.env.AWS_REGION ?? 'us-east-1'. */
  region?: string;
}

let cachedClient: SESClient | undefined;
let cachedRegion: string | undefined;

function getClient(region: string): SESClient {
  if (!cachedClient || cachedRegion !== region) {
    cachedClient = new SESClient({ region });
    cachedRegion = region;
  }
  return cachedClient;
}

/**
 * Envía un correo por SES. Lanza si falta el remitente o si SES rechaza el envío.
 * @returns el MessageId asignado por SES (evidencia de envío).
 */
export async function sendEmailViaSes(
  email: SesEmail,
  options: SesMailerOptions = {},
): Promise<string> {
  const from = options.from ?? process.env.SES_FROM_ADDRESS;
  const region = options.region ?? process.env.AWS_REGION ?? 'us-east-1';

  if (!from) {
    throw new Error('SES_FROM_ADDRESS no está configurado: no se puede enviar el correo');
  }

  const body: Record<string, { Data: string; Charset: string }> = {
    Text: { Data: email.text, Charset: 'UTF-8' },
  };
  if (email.html) {
    body.Html = { Data: email.html, Charset: 'UTF-8' };
  }

  const command = new SendEmailCommand({
    Source: from,
    Destination: { ToAddresses: [email.to] },
    Message: {
      Subject: { Data: email.subject, Charset: 'UTF-8' },
      Body: body,
    },
  });

  const result = await getClient(region).send(command);
  return result.MessageId ?? '';
}

/** Sólo para pruebas: descarta el cliente cacheado. */
export function __resetSesClientForTests(): void {
  cachedClient = undefined;
  cachedRegion = undefined;
}
