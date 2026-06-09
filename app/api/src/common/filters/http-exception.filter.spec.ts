import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

// Helpers para construir el host mock de NestJS
function buildMockHost(overrides?: {
  method?: string;
  url?: string;
  statusFn?: jest.Mock;
  jsonFn?: jest.Mock;
}) {
  const method = overrides?.method ?? 'GET';
  const url = overrides?.url ?? '/v1/tickets';
  const jsonFn = overrides?.jsonFn ?? jest.fn();
  const statusFn = overrides?.statusFn ?? jest.fn().mockReturnValue({ json: jsonFn });

  const mockRequest = { method, url, headers: {} as Record<string, string> };
  const mockResponse = { status: statusFn, setHeader: jest.fn() };

  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(mockRequest),
      getResponse: jest.fn().mockReturnValue(mockResponse),
    }),
    jsonFn,
    statusFn,
  };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    // Silenciar logs durante los tests
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  describe('estructura RFC 9457', () => {
    it('responde con los campos type, title, status, detail, instance, timestamp', () => {
      const exception = new HttpException('Recurso no encontrado', HttpStatus.NOT_FOUND);
      const { switchToHttp, statusFn, jsonFn } = buildMockHost({ url: '/v1/tickets/99' });

      filter.catch(exception, { switchToHttp } as any);

      expect(statusFn).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      const body = jsonFn.mock.calls[0][0];
      expect(body).toMatchObject({
        type: 'not-found',
        title: 'Recurso no encontrado',
        status: HttpStatus.NOT_FOUND,
        detail: 'Recurso no encontrado',
        instance: '/v1/tickets/99',
      });
      expect(typeof body.timestamp).toBe('string');
      expect(typeof body.request_id).toBe('string');
    });

    it('timestamp es un ISO 8601 válido', () => {
      const exception = new HttpException('Error', HttpStatus.BAD_REQUEST);
      const { switchToHttp, jsonFn } = buildMockHost();

      filter.catch(exception, { switchToHttp } as any);

      const body = jsonFn.mock.calls[0][0];
      expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
    });
  });

  describe('extracción de detail', () => {
    it('usa el string de respuesta como detail cuando getResponse() devuelve string', () => {
      const exception = new HttpException('Acceso denegado', HttpStatus.FORBIDDEN);
      const { switchToHttp, jsonFn } = buildMockHost();

      filter.catch(exception, { switchToHttp } as any);

      const body = jsonFn.mock.calls[0][0];
      expect(body.detail).toBe('Acceso denegado');
    });

    it('extrae message del objeto cuando getResponse() devuelve un objeto', () => {
      const responseObj = { message: 'Campo requerido faltante', error: 'Bad Request' };
      const exception = new HttpException(responseObj, HttpStatus.BAD_REQUEST);
      const { switchToHttp, jsonFn } = buildMockHost();

      filter.catch(exception, { switchToHttp } as any);

      const body = jsonFn.mock.calls[0][0];
      expect(body.detail).toBe('Campo requerido faltante');
    });

    it('extrae array de mensajes cuando ValidationPipe devuelve array', () => {
      const responseObj = {
        message: ['title no debe estar vacío', 'description es requerido'],
        error: 'Bad Request',
      };
      const exception = new HttpException(responseObj, HttpStatus.BAD_REQUEST);
      const { switchToHttp, jsonFn } = buildMockHost();

      filter.catch(exception, { switchToHttp } as any);

      const body = jsonFn.mock.calls[0][0];
      expect(Array.isArray(body.detail)).toBe(true);
      expect(body.detail).toContain('title no debe estar vacío');
    });
  });

  describe('status HTTP correcto', () => {
    it.each([
      [HttpStatus.BAD_REQUEST, 400],
      [HttpStatus.UNAUTHORIZED, 401],
      [HttpStatus.FORBIDDEN, 403],
      [HttpStatus.NOT_FOUND, 404],
      [HttpStatus.CONFLICT, 409],
      [HttpStatus.UNPROCESSABLE_ENTITY, 422],
      [HttpStatus.INTERNAL_SERVER_ERROR, 500],
    ])('usa status %i de la excepción', (nestStatus, expected) => {
      const exception = new HttpException('msg', nestStatus);
      const { switchToHttp, statusFn } = buildMockHost();

      filter.catch(exception, { switchToHttp } as any);

      expect(statusFn).toHaveBeenCalledWith(expected);
    });
  });

  describe('instance refleja la ruta del request', () => {
    it('el campo instance es la URL del request', () => {
      const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);
      const { switchToHttp, jsonFn } = buildMockHost({ url: '/v1/users/42' });

      filter.catch(exception, { switchToHttp } as any);

      const body = jsonFn.mock.calls[0][0];
      expect(body.instance).toBe('/v1/users/42');
    });
  });

  describe('logging', () => {
    it('llama a logger.error con método, path, statusCode y message', () => {
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
      const { switchToHttp } = buildMockHost({
        method: 'DELETE',
        url: '/v1/tickets/1',
      });

      filter.catch(exception, { switchToHttp } as any);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          path: '/v1/tickets/1',
          statusCode: HttpStatus.FORBIDDEN,
        }),
      );
    });
  });

  describe('type es un slug de problema por status (RFC 9457)', () => {
    it('CONFLICT → "conflict"', () => {
      const exception = new HttpException('Conflict', HttpStatus.CONFLICT);
      const { switchToHttp, jsonFn } = buildMockHost();

      filter.catch(exception, { switchToHttp } as any);

      const body = jsonFn.mock.calls[0][0];
      expect(body.type).toBe('conflict');
    });

    it('respeta el type provisto en el cuerpo de la excepción', () => {
      const exception = new HttpException(
        { type: 'conflict-version', detail: 'cambió' },
        HttpStatus.CONFLICT,
      );
      const { switchToHttp, jsonFn } = buildMockHost();

      filter.catch(exception, { switchToHttp } as any);

      const body = jsonFn.mock.calls[0][0];
      expect(body.type).toBe('conflict-version');
      expect(body.detail).toBe('cambió');
    });

    it('usa el x-request-id del header si viene', () => {
      const exception = new HttpException('x', HttpStatus.BAD_REQUEST);
      const { switchToHttp, jsonFn } = buildMockHost();
      // inyecta el header en el request mock
      const host = { switchToHttp } as any;
      const req = host.switchToHttp().getRequest();
      req.headers['x-request-id'] = 'req-abc';

      filter.catch(exception, host);

      const body = jsonFn.mock.calls[0][0];
      expect(body.request_id).toBe('req-abc');
    });
  });

  describe('branch defensivo: getStatus faltante', () => {
    it('usa INTERNAL_SERVER_ERROR cuando la excepción no tiene getStatus', () => {
      // Este path es defensivo para excepciones que implementen la interfaz parcialmente.
      // HttpException siempre tiene getStatus(), pero el código guarda un ternario
      // para cubrir el caso en que getStatus sea undefined.
      const exception = new HttpException('Error interno', HttpStatus.INTERNAL_SERVER_ERROR);
      // Eliminamos getStatus para forzar el branch del else
      (exception as any).getStatus = undefined;

      const { switchToHttp, statusFn } = buildMockHost();
      filter.catch(exception, { switchToHttp } as any);

      expect(statusFn).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
