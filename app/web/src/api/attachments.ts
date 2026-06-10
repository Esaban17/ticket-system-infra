import { apiClient } from './client';
import type {
  DownloadUrlResponse,
  RequestUploadRequest,
  RequestUploadResponse,
} from './types';

/**
 * Solicita una URL presignada de subida (PUT, 10 min).
 * Luego el `attachmentId` se asocia vía `attachments` en POST /v1/tickets.
 * NOTA: en local sin AWS el presign puede fallar — degradar con elegancia.
 */
export function requestUpload(
  body: RequestUploadRequest,
): Promise<RequestUploadResponse> {
  return apiClient.post<RequestUploadResponse>('/attachments', { body });
}

/** Obtiene URL presignada de descarga del adjunto. */
export function getDownloadUrl(attachmentId: string): Promise<DownloadUrlResponse> {
  return apiClient.get<DownloadUrlResponse>(`/attachments/${attachmentId}/download`);
}
