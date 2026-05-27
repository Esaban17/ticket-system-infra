import { z } from 'zod';

/**
 * Esquema de validación de variables de entorno con Zod.
 * Se ejecuta al arrancar la aplicación; si falta una variable requerida
 * o el valor es inválido, el proceso termina con un error descriptivo.
 */
export const envSchema = z.object({
  // Servidor
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),

  // Base de datos
  DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL válida de PostgreSQL'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('3600s'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // AWS (opcionales en desarrollo local)
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET_ATTACHMENTS: z.string().optional(),

  // SLA (minutos)
  SLA_CRITICAL_MINUTES: z.coerce.number().int().positive().default(60),
  SLA_HIGH_MINUTES: z.coerce.number().int().positive().default(240),
  SLA_MEDIUM_MINUTES: z.coerce.number().int().positive().default(480),
  SLA_LOW_MINUTES: z.coerce.number().int().positive().default(1440),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Función validadora para @nestjs/config.
 * Lanza un error con todos los campos inválidos agrupados si la validación falla.
 */
export function validate(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${formatted}`);
  }

  return result.data;
}
