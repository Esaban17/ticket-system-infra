import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** Filtros whitelisted del reporte CSV (BL-037). */
export class ReportQuery {
  @IsOptional()
  @IsISO8601()
  from?: string; // filtra por resolved_at >= from

  @IsOptional()
  @IsISO8601()
  to?: string; // filtra por resolved_at <= to

  @IsOptional()
  @IsIn(['critica', 'alta', 'media', 'baja'])
  priority?: 'critica' | 'alta' | 'media' | 'baja';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assigneeId?: string;
}
