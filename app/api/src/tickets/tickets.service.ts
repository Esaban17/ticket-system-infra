import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { PrismaService } from '@/prisma/prisma.service';

export interface StoredObject {
  key: string;
  bucket: string;
}

/**
 * Business logic for the two end-to-end proof endpoints (Delivery 3):
 *   - list()           reads ticket rows from RDS via Prisma (DB path).
 *   - saveAttachment() writes a JSON object to the S3 bucket (storage path).
 *
 * AWS credentials are NOT configured here: the pod assumes its IRSA role and
 * the AWS SDK picks up the temporary credentials automatically from the
 * environment injected by EKS Pod Identity / IRSA.
 */
@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly prisma: PrismaService) {
    this.bucket = process.env.AWS_S3_BUCKET_ATTACHMENTS ?? '';
    this.s3 = new S3Client({ region: process.env.AWS_REGION });
  }

  /** GET /v1/tickets — returns DB-sourced rows as JSON. */
  list() {
    return this.prisma.ticket.findMany({ orderBy: { id: 'asc' } });
  }

  /** POST /v1/tickets — writes the request body to S3, returns the object key. */
  async saveAttachment(payload: unknown): Promise<StoredObject> {
    const key = `uploads/${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(payload ?? {}),
        ContentType: 'application/json',
      }),
    );

    this.logger.log(`Stored object s3://${this.bucket}/${key}`);
    return { key, bucket: this.bucket };
  }
}
