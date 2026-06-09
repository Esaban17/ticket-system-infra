import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { User } from '@prisma/client';

import { CurrentUser } from '@/auth/current-user.decorator';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  // POST /v1/attachments — devuelve la URL prefirmada de upload (BL-024).
  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateAttachmentDto, @CurrentUser() user: User) {
    return this.attachments.createUpload(dto, user);
  }

  // GET /v1/attachments/:id/download — URL prefirmada de descarga (BL-025).
  @Get(':id/download')
  download(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: User) {
    return this.attachments.getDownload(id, user);
  }
}
