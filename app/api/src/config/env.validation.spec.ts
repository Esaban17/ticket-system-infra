import { validate, envSchema } from './env.validation';

const BASE_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/tickets',
  JWT_SECRET: 'super-secret-key-that-is-at-least-32-chars!!',
};

describe('envSchema', () => {
  describe('campos con defaults', () => {
    it('aplica default PORT=8080 cuando no se provee', () => {
      const result = envSchema.safeParse(BASE_ENV);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(8080);
      }
    });

    it('aplica default NODE_ENV=development cuando no se provee', () => {
      const result = envSchema.safeParse(BASE_ENV);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('development');
      }
    });

    it('aplica default JWT_EXPIRES_IN=3600s', () => {
      const result = envSchema.safeParse(BASE_ENV);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_EXPIRES_IN).toBe('3600s');
      }
    });

    it('aplica default LOG_LEVEL=log', () => {
      const result = envSchema.safeParse(BASE_ENV);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LOG_LEVEL).toBe('log');
      }
    });

    it('aplica default CORS_ORIGINS=http://localhost:3000', () => {
      const result = envSchema.safeParse(BASE_ENV);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CORS_ORIGINS).toBe('http://localhost:3000');
      }
    });

    it('aplica defaults de SLA en minutos', () => {
      const result = envSchema.safeParse(BASE_ENV);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SLA_CRITICAL_MINUTES).toBe(60);
        expect(result.data.SLA_HIGH_MINUTES).toBe(240);
        expect(result.data.SLA_MEDIUM_MINUTES).toBe(480);
        expect(result.data.SLA_LOW_MINUTES).toBe(1440);
      }
    });
  });

  describe('campos requeridos', () => {
    it('falla si falta DATABASE_URL', () => {
      const result = envSchema.safeParse({ JWT_SECRET: BASE_ENV.JWT_SECRET });
      expect(result.success).toBe(false);
    });

    it('falla si DATABASE_URL no es una URL válida', () => {
      const result = envSchema.safeParse({
        ...BASE_ENV,
        DATABASE_URL: 'no-es-url',
      });
      expect(result.success).toBe(false);
    });

    it('falla si falta JWT_SECRET', () => {
      const result = envSchema.safeParse({ DATABASE_URL: BASE_ENV.DATABASE_URL });
      expect(result.success).toBe(false);
    });

    it('falla si JWT_SECRET tiene menos de 32 caracteres', () => {
      const result = envSchema.safeParse({
        ...BASE_ENV,
        JWT_SECRET: 'corto',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('coerciones numéricas', () => {
    it('coerce PORT de string a number', () => {
      const result = envSchema.safeParse({ ...BASE_ENV, PORT: '3000' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(3000);
        expect(typeof result.data.PORT).toBe('number');
      }
    });

    it('falla si PORT es un número negativo', () => {
      const result = envSchema.safeParse({ ...BASE_ENV, PORT: '-1' });
      expect(result.success).toBe(false);
    });

    it('falla si PORT es cero', () => {
      const result = envSchema.safeParse({ ...BASE_ENV, PORT: '0' });
      expect(result.success).toBe(false);
    });

    it('coerce SLA_CRITICAL_MINUTES de string a number', () => {
      const result = envSchema.safeParse({
        ...BASE_ENV,
        SLA_CRITICAL_MINUTES: '30',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SLA_CRITICAL_MINUTES).toBe(30);
      }
    });
  });

  describe('validaciones de enum', () => {
    it('acepta NODE_ENV válido: production', () => {
      const result = envSchema.safeParse({ ...BASE_ENV, NODE_ENV: 'production' });
      expect(result.success).toBe(true);
    });

    it('acepta NODE_ENV válido: test', () => {
      const result = envSchema.safeParse({ ...BASE_ENV, NODE_ENV: 'test' });
      expect(result.success).toBe(true);
    });

    it('acepta NODE_ENV válido: staging', () => {
      const result = envSchema.safeParse({ ...BASE_ENV, NODE_ENV: 'staging' });
      expect(result.success).toBe(true);
    });

    it('falla si NODE_ENV tiene valor inválido', () => {
      const result = envSchema.safeParse({
        ...BASE_ENV,
        NODE_ENV: 'invalid_env',
      });
      expect(result.success).toBe(false);
    });

    it('falla si LOG_LEVEL tiene valor inválido', () => {
      const result = envSchema.safeParse({
        ...BASE_ENV,
        LOG_LEVEL: 'trace',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('campos opcionales AWS', () => {
    it('acepta env sin AWS_REGION (campo opcional)', () => {
      const result = envSchema.safeParse(BASE_ENV);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.AWS_REGION).toBeUndefined();
        expect(result.data.AWS_S3_BUCKET_ATTACHMENTS).toBeUndefined();
      }
    });

    it('acepta AWS_REGION cuando se provee', () => {
      const result = envSchema.safeParse({ ...BASE_ENV, AWS_REGION: 'us-east-1' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.AWS_REGION).toBe('us-east-1');
      }
    });
  });
});

describe('validate()', () => {
  it('retorna el objeto parseado cuando el env es válido', () => {
    const result = validate(BASE_ENV as Record<string, unknown>);
    expect(result.DATABASE_URL).toBe(BASE_ENV.DATABASE_URL);
    expect(result.JWT_SECRET).toBe(BASE_ENV.JWT_SECRET);
    expect(result.PORT).toBe(8080);
  });

  it('lanza Error con mensaje descriptivo cuando falta DATABASE_URL', () => {
    expect(() => validate({ JWT_SECRET: BASE_ENV.JWT_SECRET } as Record<string, unknown>)).toThrow(
      'Variables de entorno inválidas:',
    );
  });

  it('el mensaje de error incluye el nombre del campo inválido', () => {
    expect(() => validate({ JWT_SECRET: BASE_ENV.JWT_SECRET } as Record<string, unknown>)).toThrow(
      'DATABASE_URL',
    );
  });

  it('agrupa múltiples errores en un solo throw', () => {
    expect(() => validate({} as Record<string, unknown>)).toThrow(
      'Variables de entorno inválidas:',
    );
  });

  it('el error reporta DATABASE_URL cuando falta (sin SECRET_ARN)', () => {
    // D5-B: DATABASE_URL es opcional a nivel de campo (la deriva el secret-loader
    // desde SECRET_ARN). El error "falta DATABASE_URL (y no hay SECRET_ARN)"
    // proviene de un superRefine, que en Zod solo corre si el parseo base tuvo
    // éxito. Por eso aquí se provee un JWT_SECRET válido para que el refine se
    // dispare y reporte DATABASE_URL.
    let errorMsg = '';
    try {
      validate({ JWT_SECRET: BASE_ENV.JWT_SECRET } as Record<string, unknown>);
    } catch (e) {
      errorMsg = (e as Error).message;
    }
    expect(errorMsg).toContain('DATABASE_URL');
  });

  it('acepta env sin DATABASE_URL cuando SECRET_ARN está presente (D5-B)', () => {
    const result = validate({
      JWT_SECRET: BASE_ENV.JWT_SECRET,
      SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:ticket-system-dev-db-abc',
    } as Record<string, unknown>);
    expect(result.DATABASE_URL).toBeUndefined();
    expect(result.SECRET_ARN).toContain('secret:ticket-system-dev-db');
  });
});
