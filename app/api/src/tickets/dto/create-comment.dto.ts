import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

const norm = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

/**
 * POST /v1/tickets/:id/comments (EP-13 / BL-120).
 * message = texto del comentario; no vacío (tras normalizar espacios).
 */
export class CreateCommentDto {
  @Transform(norm)
  @IsString()
  @MinLength(1, { message: 'message no puede estar vacío' })
  message!: string;
}
