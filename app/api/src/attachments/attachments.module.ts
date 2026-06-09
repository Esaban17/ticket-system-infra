import { Module } from '@nestjs/common';

import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { S3PresignService } from './s3-presign.service';

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, S3PresignService],
})
export class AttachmentsModule {}
