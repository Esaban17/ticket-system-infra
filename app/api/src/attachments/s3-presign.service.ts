import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Genera URLs prefirmadas de S3 (EP-06). Las credenciales las provee IRSA en el
 * pod (el SDK las toma del entorno); no se configuran aquí.
 */
@Injectable()
export class S3PresignService {
  private readonly s3 = new S3Client({ region: process.env.AWS_REGION });
  private readonly bucket = process.env.AWS_S3_BUCKET_ATTACHMENTS ?? '';

  /** PUT prefirmado para subir un objeto (default 10 min). */
  presignPut(key: string, contentType: string, expiresIn = 600): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  /** GET prefirmado para descargar un objeto (default 5 min). */
  presignGet(key: string, expiresIn = 300): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn,
    });
  }
}
