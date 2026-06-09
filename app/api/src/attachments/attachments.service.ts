import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Attachment, AttachmentStatus, EventType, Role, User } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { S3PresignService } from './s3-presign.service';
import {
  CreateAttachmentDto,
  MAX_ATTACHMENT_BYTES,
  MIME_EXTENSION,
} from './dto/create-attachment.dto';

const UPLOAD_TTL_SECONDS = 600; // 10 min (presigned PUT)
const DOWNLOAD_TTL_SECONDS = 300; // 5 min (presigned GET)
const PENDING_TTL_MS = 24 * 60 * 60 * 1000; // 24h hasta expirar el pending

export interface UploadTicket {
  attachmentId: string;
  key: string;
  uploadUrl: string;
  expiresIn: number;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3PresignService,
  ) {}

  /** POST /v1/attachments (BL-024): valida mime+size, key=UUID.ext, fila pending + PUT prefirmado. */
  async createUpload(dto: CreateAttachmentDto, user: User): Promise<UploadTicket> {
    const ext = MIME_EXTENSION[dto.contentType];
    if (!ext) {
      throw new UnprocessableEntityException(`content_type no permitido: ${dto.contentType}`);
    }
    if (dto.sizeBytes > MAX_ATTACHMENT_BYTES) {
      throw new UnprocessableEntityException('El archivo excede el tamaño máximo (10 MB)');
    }

    const key = `${randomUUID()}.${ext}`; // el filename del cliente NO se usa para el key
    const attachment = await this.prisma.attachment.create({
      data: {
        s3Key: key,
        originalFilename: dto.filename,
        contentType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        uploaderId: user.id,
        status: AttachmentStatus.pending,
        expiresAt: new Date(Date.now() + PENDING_TTL_MS),
      },
    });

    const uploadUrl = await this.s3.presignPut(key, dto.contentType, UPLOAD_TTL_SECONDS);
    return { attachmentId: attachment.id, key, uploadUrl, expiresIn: UPLOAD_TTL_SECONDS };
  }

  /** GET /v1/attachments/:id/download (BL-025): URL GET prefirmada con control de acceso. */
  async getDownload(id: string, user: User): Promise<{ downloadUrl: string; expiresIn: number }> {
    const att = await this.prisma.attachment.findUnique({ where: { id } });
    if (!att) {
      throw new NotFoundException('Adjunto no encontrado');
    }

    await this.assertCanAccess(att, user);

    const downloadUrl = await this.s3.presignGet(att.s3Key, DOWNLOAD_TTL_SECONDS);

    if (att.ticketId) {
      await this.prisma.ticketEvent.create({
        data: {
          ticketId: att.ticketId,
          actorId: user.id,
          eventType: EventType.adjunto_descargado,
          payload: { attachment_id: att.id, s3_key: att.s3Key },
        },
      });
    }
    return { downloadUrl, expiresIn: DOWNLOAD_TTL_SECONDS };
  }

  /** Reportante: solo adjuntos de SUS tickets, o pending propios. Agente/admin: cualquiera. 404 si no. */
  private async assertCanAccess(att: Attachment, user: User): Promise<void> {
    if (user.role !== Role.reportante) {
      return; // agente/admin
    }
    if (att.ticketId) {
      const ticket = await this.prisma.ticket.findUnique({ where: { id: att.ticketId } });
      if (!ticket || ticket.reporterId !== user.id) {
        throw new NotFoundException('Adjunto no encontrado');
      }
      return;
    }
    // pending (sin ticket): solo el uploader original
    if (att.uploaderId !== user.id) {
      throw new NotFoundException('Adjunto no encontrado');
    }
  }
}
