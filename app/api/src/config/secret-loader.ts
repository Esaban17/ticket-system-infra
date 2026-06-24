import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

/**
 * Carga de credenciales de BD desde AWS Secrets Manager en tiempo de ejecución
 * (Delivery 5 — Deliverable B).
 *
 * Diseño (rompe el ciclo secrets <-> database):
 *   - El secret contiene SOLO {username, password} (lo sensible).
 *   - DB_HOST / DB_PORT / DB_NAME viajan por el ConfigMap (no sensible), porque
 *     el host es el endpoint de RDS (apply-time) y meterlo en el secret crearía
 *     una dependencia circular en Terraform.
 *   - Esta función combina ambas fuentes y compone process.env.DATABASE_URL
 *     ANTES de que NestFactory/Prisma arranquen (env.validation exige DATABASE_URL).
 *
 * Credenciales AWS: las provee IRSA en el pod; el SDK las toma del entorno, igual
 * que en s3-presign.service.ts. No se configuran aquí.
 *
 * Idempotente y no-bloqueante en local: si SECRET_ARN no está definido, no hace
 * nada (se asume DATABASE_URL ya presente en el entorno, p.ej. .env local).
 */
export async function loadSecretIntoEnv(): Promise<void> {
  const secretArn = process.env.SECRET_ARN;
  if (!secretArn) {
    // Sin SECRET_ARN: entorno local/test. DATABASE_URL debe venir del .env.
    return;
  }

  // Si DATABASE_URL ya está compuesto (p.ej. un reintento del loader), no repetir.
  if (process.env.DATABASE_URL) {
    return;
  }

  const region = process.env.AWS_REGION ?? 'us-east-1';
  const client = new SecretsManagerClient({ region });

  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));

  if (!response.SecretString) {
    throw new Error(`El secret ${secretArn} no contiene SecretString (¿es binario?).`);
  }

  let parsed: { username?: string; password?: string };
  try {
    parsed = JSON.parse(response.SecretString) as { username?: string; password?: string };
  } catch {
    throw new Error(`El SecretString de ${secretArn} no es JSON válido.`);
  }

  const { username, password } = parsed;
  if (!username || !password) {
    throw new Error(`El secret ${secretArn} debe contener "username" y "password".`);
  }

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? '5432';
  const dbName = process.env.DB_NAME;

  if (!host || !dbName) {
    throw new Error(
      'DB_HOST y DB_NAME deben estar definidos en el entorno (ConfigMap) para componer DATABASE_URL.',
    );
  }

  // Codificar credenciales por si contienen caracteres especiales para URLs.
  const user = encodeURIComponent(username);
  const pass = encodeURIComponent(password);

  process.env.DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${dbName}?schema=public`;
}
