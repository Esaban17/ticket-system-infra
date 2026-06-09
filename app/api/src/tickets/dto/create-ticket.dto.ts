import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const norm = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

/**
 * Validación de POST /v1/tickets (BL-012). El trim+normalización de espacios
 * más los MinLength rechazan strings vacíos disfrazados ("  ", ".", "n/a").
 */
export class CreateTicketDto {
  @IsIn(['incidente', 'solicitud'])
  type!: 'incidente' | 'solicitud';

  @Transform(norm)
  @IsString()
  @MinLength(5, { message: 'title debe tener al menos 5 caracteres no vacíos' })
  @MaxLength(200)
  title!: string;

  @Transform(norm)
  @IsString()
  @MinLength(20, { message: 'description debe tener al menos 20 caracteres no vacíos' })
  @MaxLength(5000)
  description!: string;

  @IsInt()
  @Min(1)
  @Max(4)
  severity!: number;

  @IsInt()
  @Min(1)
  @Max(4)
  impact!: number;

  // IDs de adjuntos pre-subidos (EP-06). La asociación se implementa en EP-06.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  attachments?: string[];
}
