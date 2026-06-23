import { configuration } from './configuration';
import { EnvConfig } from './env.validation';

const BASE_ENV: EnvConfig = {
  PORT: 8080,
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/tickets',
  JWT_SECRET: 'super-secret-key-that-is-at-least-32-chars!!',
  JWT_EXPIRES_IN: '3600s',
  AUTH_PROVIDER: 'mock',
  LOG_LEVEL: 'log',
  CORS_ORIGINS: 'http://localhost:3000',
  AWS_REGION: undefined,
  AWS_S3_BUCKET_ATTACHMENTS: undefined,
  SLA_CRITICAL_MINUTES: 60,
  SLA_HIGH_MINUTES: 240,
  SLA_MEDIUM_MINUTES: 480,
  SLA_LOW_MINUTES: 1440,
};

describe('configuration()', () => {
  it('mapea port correctamente', () => {
    const config = configuration(BASE_ENV);
    expect(config.port).toBe(8080);
  });

  it('mapea nodeEnv correctamente', () => {
    const config = configuration(BASE_ENV);
    expect(config.nodeEnv).toBe('development');
  });

  it('mapea database.url correctamente', () => {
    const config = configuration(BASE_ENV);
    expect(config.database.url).toBe(BASE_ENV.DATABASE_URL);
  });

  it('auth.provider mapea y cognito es null sin config', () => {
    const config = configuration(BASE_ENV);
    expect(config.auth.provider).toBe('mock');
    expect(config.auth.cognito).toBeNull();
  });

  it('auth.cognito se arma cuando los 4 campos están presentes', () => {
    const config = configuration({
      ...BASE_ENV,
      AWS_REGION: 'us-east-1',
      AUTH_PROVIDER: 'cognito',
      COGNITO_USER_POOL_ID: 'us-east-1_abc',
      COGNITO_CLIENT_ID: 'client123',
      COGNITO_DOMAIN: 'https://t.auth.us-east-1.amazoncognito.com',
      COGNITO_REDIRECT_URI: 'http://localhost:5173/auth/callback',
      COGNITO_LOGOUT_URI: 'http://localhost:5173/login',
    });
    expect(config.auth.provider).toBe('cognito');
    expect(config.auth.cognito).toMatchObject({
      userPoolId: 'us-east-1_abc',
      clientId: 'client123',
      redirectUri: 'http://localhost:5173/auth/callback',
      region: 'us-east-1',
    });
  });

  it('mapea jwt.secret y jwt.expiresIn correctamente', () => {
    const config = configuration(BASE_ENV);
    expect(config.jwt.secret).toBe(BASE_ENV.JWT_SECRET);
    expect(config.jwt.expiresIn).toBe('3600s');
  });

  it('mapea logging.level correctamente', () => {
    const config = configuration(BASE_ENV);
    expect(config.logging.level).toBe('log');
  });

  describe('cors.origins', () => {
    it('convierte un solo origen en array de un elemento', () => {
      const config = configuration(BASE_ENV);
      expect(config.cors.origins).toEqual(['http://localhost:3000']);
    });

    it('hace split por coma en origenes múltiples', () => {
      const env: EnvConfig = {
        ...BASE_ENV,
        CORS_ORIGINS: 'http://localhost:3000,https://app.example.com',
      };
      const config = configuration(env);
      expect(config.cors.origins).toEqual(['http://localhost:3000', 'https://app.example.com']);
    });

    it('hace trim de espacios alrededor de cada origen', () => {
      const env: EnvConfig = {
        ...BASE_ENV,
        CORS_ORIGINS: 'http://localhost:3000 , https://app.example.com ',
      };
      const config = configuration(env);
      expect(config.cors.origins).toEqual(['http://localhost:3000', 'https://app.example.com']);
    });
  });

  describe('aws', () => {
    it('mapea aws.region como undefined cuando no se provee', () => {
      const config = configuration(BASE_ENV);
      expect(config.aws.region).toBeUndefined();
    });

    it('mapea aws.s3.bucketAttachments como undefined cuando no se provee', () => {
      const config = configuration(BASE_ENV);
      expect(config.aws.s3.bucketAttachments).toBeUndefined();
    });

    it('mapea aws.region cuando se provee', () => {
      const env: EnvConfig = { ...BASE_ENV, AWS_REGION: 'us-east-1' };
      const config = configuration(env);
      expect(config.aws.region).toBe('us-east-1');
    });

    it('mapea aws.s3.bucketAttachments cuando se provee', () => {
      const env: EnvConfig = {
        ...BASE_ENV,
        AWS_S3_BUCKET_ATTACHMENTS: 'ticket-attachments-dev',
      };
      const config = configuration(env);
      expect(config.aws.s3.bucketAttachments).toBe('ticket-attachments-dev');
    });
  });

  describe('sla', () => {
    it('mapea todos los minutos de SLA correctamente', () => {
      const config = configuration(BASE_ENV);
      expect(config.sla.criticalMinutes).toBe(60);
      expect(config.sla.highMinutes).toBe(240);
      expect(config.sla.mediumMinutes).toBe(480);
      expect(config.sla.lowMinutes).toBe(1440);
    });

    it('refleja valores custom de SLA', () => {
      const env: EnvConfig = {
        ...BASE_ENV,
        SLA_CRITICAL_MINUTES: 30,
        SLA_HIGH_MINUTES: 120,
        SLA_MEDIUM_MINUTES: 360,
        SLA_LOW_MINUTES: 720,
      };
      const config = configuration(env);
      expect(config.sla.criticalMinutes).toBe(30);
      expect(config.sla.highMinutes).toBe(120);
      expect(config.sla.mediumMinutes).toBe(360);
      expect(config.sla.lowMinutes).toBe(720);
    });
  });
});
