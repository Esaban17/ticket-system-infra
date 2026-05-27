// Las variables de entorno deben estar disponibles ANTES de que Jest cargue
// los módulos de NestJS. Jest ejecuta el módulo en tiempo de importación;
// ConfigModule.forRoot llama a validate() en ese momento.
// La forma correcta es setear process.env antes de cualquier import dinámico.

const TEST_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/tickets_test',
  JWT_SECRET: 'super-secret-key-that-is-at-least-32-chars!!',
  NODE_ENV: 'test',
};

// Inyectamos antes de cualquier import de NestJS
Object.assign(process.env, TEST_ENV);

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';

describe('AppModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  it('compila sin errores', () => {
    expect(module).toBeDefined();
  });

  it('registra ConfigModule como módulo global — ConfigService resolvible', () => {
    const configService = module.get(ConfigService);
    expect(configService).toBeDefined();
    expect(configService).toBeInstanceOf(ConfigService);
  });

  it('ConfigService expone el puerto configurado (default 8080)', () => {
    const configService = module.get(ConfigService);
    const port = configService.get<number>('port');
    expect(port).toBe(8080);
  });

  it('ConfigService expone nodeEnv como "test"', () => {
    const configService = module.get(ConfigService);
    const nodeEnv = configService.get<string>('nodeEnv');
    expect(nodeEnv).toBe('test');
  });

  it('ConfigService expone database.url correctamente', () => {
    const configService = module.get(ConfigService);
    const dbUrl = configService.get<string>('database.url');
    expect(dbUrl).toBe(TEST_ENV.DATABASE_URL);
  });

  it('declara HttpExceptionFilter en los providers del módulo (APP_FILTER)', () => {
    // Los providers registrados como APP_FILTER / APP_INTERCEPTOR usan el token
    // multi-provider de NestJS. Se verifica a través de los metadata decorados
    // en la clase AppModule.
    const providers: Array<{ provide: symbol; useClass: unknown }> =
      Reflect.getMetadata('providers', AppModule) ?? [];
    const hasFilter = providers.some((p) => p.useClass === HttpExceptionFilter);
    expect(hasFilter).toBe(true);
  });

  it('declara LoggingInterceptor en los providers del módulo (APP_INTERCEPTOR)', () => {
    const providers: Array<{ provide: symbol; useClass: unknown }> =
      Reflect.getMetadata('providers', AppModule) ?? [];
    const hasInterceptor = providers.some((p) => p.useClass === LoggingInterceptor);
    expect(hasInterceptor).toBe(true);
  });
});
