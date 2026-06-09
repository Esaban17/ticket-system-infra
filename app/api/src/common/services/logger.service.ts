import { Injectable } from '@nestjs/common';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  request_id?: string;
  actor_id?: string;
  [key: string]: unknown;
}

const SERVICE = 'ticket-system-api';

/**
 * Logger estructurado JSON (BL-042). Emite una línea JSON por evento con campos
 * estándar (timestamp, level, service, env, message) + campos arbitrarios
 * (request_id, actor_id, ...) que CloudWatch Logs Insights consulta por campo.
 */
@Injectable()
export class JsonLoggerService {
  /** Construye el registro estructurado (puro, testeable). */
  build(level: LogLevel, message: string, fields: LogFields = {}): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(),
      level,
      service: SERVICE,
      env: process.env.NODE_ENV ?? 'development',
      message,
      ...fields,
    };
  }

  private emit(level: LogLevel, message: string, fields?: LogFields): void {
    process.stdout.write(JSON.stringify(this.build(level, message, fields)) + '\n');
  }

  debug(message: string, fields?: LogFields): void {
    this.emit('debug', message, fields);
  }
  info(message: string, fields?: LogFields): void {
    this.emit('info', message, fields);
  }
  warn(message: string, fields?: LogFields): void {
    this.emit('warn', message, fields);
  }
  error(message: string, fields?: LogFields): void {
    this.emit('error', message, fields);
  }
}
