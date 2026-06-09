import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Whitelist de content-types permitidos → extensión usada en el key S3.
 * El filename del cliente NO se usa para el key (se usa UUID + esta extensión).
 */
export const MIME_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/x-log': 'log',
};

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export class CreateAttachmentDto {
  @IsString()
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MaxLength(127)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_ATTACHMENT_BYTES)
  sizeBytes!: number;
}
