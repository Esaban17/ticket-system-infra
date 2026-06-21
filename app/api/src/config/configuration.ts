import { EnvConfig } from './env.validation';

/**
 * Función de configuración tipada para @nestjs/config.
 * Mapea las variables de entorno (ya validadas) a un objeto estructurado
 * que los módulos pueden inyectar con ConfigService.
 */
export const configuration = (env: EnvConfig) => ({
  port: env.PORT,
  nodeEnv: env.NODE_ENV,

  database: {
    url: env.DATABASE_URL,
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },

  logging: {
    level: env.LOG_LEVEL,
  },

  cors: {
    origins: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
  },

  aws: {
    region: env.AWS_REGION,
    s3: {
      bucketAttachments: env.AWS_S3_BUCKET_ATTACHMENTS,
    },
    sqs: {
      // URL of the async notification queue (Delivery 4). Populated from the
      // Kubernetes ConfigMap (SQS_QUEUE_URL) which is set by Terraform from
      // module.async.queue_url. Undefined locally — the service logs a warning
      // and skips the SQS call if not set.
      queueUrl: env.SQS_QUEUE_URL,
    },
  },

  sla: {
    criticalMinutes: env.SLA_CRITICAL_MINUTES,
    highMinutes: env.SLA_HIGH_MINUTES,
    mediumMinutes: env.SLA_MEDIUM_MINUTES,
    lowMinutes: env.SLA_LOW_MINUTES,
  },
});

export type AppConfig = ReturnType<typeof configuration>;
