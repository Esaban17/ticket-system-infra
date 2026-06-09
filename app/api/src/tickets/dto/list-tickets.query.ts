import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Query whitelisted para GET /v1/tickets (BL-023). El ValidationPipe global
 * (whitelist + forbidNonWhitelisted) descarta parámetros arbitrarios; nada sin
 * declarar llega al ORM.
 */
export class ListTicketsQuery {
  @IsOptional()
  @IsIn(['abierto', 'en_progreso', 'resuelto'])
  status?: 'abierto' | 'en_progreso' | 'resuelto';

  @IsOptional()
  @IsIn(['critica', 'alta', 'media', 'baja'])
  priority?: 'critica' | 'alta' | 'media' | 'baja';

  // UUID o el valor especial 'me' (resuelto al usuario del JWT en el service).
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assigneeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  severity?: number;

  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  // Cursor = id del último ticket de la página anterior.
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Query para GET /v1/tickets/:id/events (BL-022). */
export class ListEventsQuery {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
