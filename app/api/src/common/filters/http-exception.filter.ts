import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';

/** Mapea el status HTTP a un slug estable de `type` (RFC 9457). */
function problemType(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'validation-error';
    case HttpStatus.UNAUTHORIZED:
      return 'unauthorized';
    case HttpStatus.FORBIDDEN:
      return 'forbidden';
    case HttpStatus.NOT_FOUND:
      return 'not-found';
    case HttpStatus.CONFLICT:
      return 'conflict';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'unprocessable';
    default:
      return status >= 500 ? 'internal-error' : 'about:blank';
  }
}

/**
 * Filtro global de excepciones HTTP — Problem Details RFC 9457 (BL-005).
 * Incluye `request_id` para correlación (header `x-request-id` o uno generado),
 * tipos de problema por status, y nunca expone stack traces.
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception.getStatus ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? randomUUID();

    const exceptionResponse = exception.getResponse();
    const body =
      typeof exceptionResponse === 'string'
        ? { detail: exceptionResponse }
        : (exceptionResponse as { message?: string | string[]; type?: string; detail?: string });
    const detail = body.detail ?? body.message;

    // Log estructurado correlacionado por request_id (visible en CloudWatch).
    this.logger.error({
      request_id: requestId,
      method: request.method,
      path: request.url,
      statusCode: status,
      message: detail,
    });

    response.setHeader('x-request-id', requestId);
    response.status(status).json({
      type: body.type ?? problemType(status),
      title: exception.message,
      status,
      detail,
      instance: request.url,
      request_id: requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
