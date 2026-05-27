import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Interceptor de logging estructurado.
 * Registra método, path, statusCode y duración de cada request.
 * Genera un requestId simple para correlación en logs.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<{ statusCode: number }>();
        const duration = Date.now() - startTime;

        this.logger.log({
          requestId,
          method,
          url,
          statusCode: response.statusCode,
          durationMs: duration,
        });
      }),
    );
  }
}
