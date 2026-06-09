import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

const norm = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

/**
 * PATCH /v1/tickets/:id/state (BL-019/020).
 * target_state = 'en_progreso' (iniciar) | 'resuelto' (resolver).
 * Para resolver, root_cause y solution son obligatorios (min 20, sin vacíos
 * disfrazados) — validado además en el handler para devolver 400 antes de tocar BD.
 */
export class ChangeStateDto {
  @IsIn(['en_progreso', 'resuelto'])
  targetState!: 'en_progreso' | 'resuelto';

  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @Transform(norm)
  @IsString()
  @MinLength(20, { message: 'root_cause debe tener al menos 20 caracteres no vacíos' })
  rootCause?: string;

  @IsOptional()
  @Transform(norm)
  @IsString()
  @MinLength(20, { message: 'solution debe tener al menos 20 caracteres no vacíos' })
  solution?: string;
}
