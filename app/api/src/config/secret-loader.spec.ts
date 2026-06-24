import { loadSecretIntoEnv } from './secret-loader';

// Mock del SDK de Secrets Manager: capturamos GetSecretValue y devolvemos un
// SecretString controlado por el test.
const sendMock = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe('loadSecretIntoEnv', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SECRET_ARN;
    delete process.env.DATABASE_URL;
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_NAME;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('es no-op cuando SECRET_ARN no está definido', async () => {
    await loadSecretIntoEnv();
    expect(sendMock).not.toHaveBeenCalled();
    expect(process.env.DATABASE_URL).toBeUndefined();
  });

  it('es no-op cuando DATABASE_URL ya está compuesta', async () => {
    process.env.SECRET_ARN = 'arn:secret';
    process.env.DATABASE_URL = 'postgresql://x:y@h:5432/d?schema=public';
    await loadSecretIntoEnv();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('compone DATABASE_URL desde el secret + DB_HOST/PORT/NAME', async () => {
    process.env.SECRET_ARN = 'arn:secret';
    process.env.DB_HOST = 'db.internal';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'tickets';
    sendMock.mockResolvedValueOnce({
      SecretString: JSON.stringify({ username: 'ticket_admin', password: 's3cr3t' }),
    });

    await loadSecretIntoEnv();

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(process.env.DATABASE_URL).toBe(
      'postgresql://ticket_admin:s3cr3t@db.internal:5432/tickets?schema=public',
    );
  });

  it('url-encode credenciales con caracteres especiales', async () => {
    process.env.SECRET_ARN = 'arn:secret';
    process.env.DB_HOST = 'db.internal';
    process.env.DB_NAME = 'tickets';
    sendMock.mockResolvedValueOnce({
      SecretString: JSON.stringify({ username: 'user', password: 'p@ss/word' }),
    });

    await loadSecretIntoEnv();

    // '@' -> %40, '/' -> %2F ; el puerto cae al default 5432.
    expect(process.env.DATABASE_URL).toBe(
      'postgresql://user:p%40ss%2Fword@db.internal:5432/tickets?schema=public',
    );
  });

  it('lanza si el secret no trae username/password', async () => {
    process.env.SECRET_ARN = 'arn:secret';
    process.env.DB_HOST = 'db.internal';
    process.env.DB_NAME = 'tickets';
    sendMock.mockResolvedValueOnce({ SecretString: JSON.stringify({ username: 'only' }) });

    await expect(loadSecretIntoEnv()).rejects.toThrow('username');
  });

  it('lanza si faltan DB_HOST/DB_NAME en el entorno', async () => {
    process.env.SECRET_ARN = 'arn:secret';
    sendMock.mockResolvedValueOnce({
      SecretString: JSON.stringify({ username: 'u', password: 'p' }),
    });

    await expect(loadSecretIntoEnv()).rejects.toThrow('DB_HOST');
  });
});
