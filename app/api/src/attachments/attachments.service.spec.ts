import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AttachmentStatus, Role, User } from '@prisma/client';

import { AttachmentsService } from './attachments.service';
import { PrismaService } from '@/prisma/prisma.service';
import { S3PresignService } from './s3-presign.service';

const reporter = { id: 'u1', role: Role.reportante } as User;
const agent = { id: 'ag', role: Role.agente } as User;

function setup() {
  const prisma = {
    attachment: { create: jest.fn(), findUnique: jest.fn() },
    ticket: { findUnique: jest.fn() },
    ticketEvent: { create: jest.fn() },
  } as unknown as PrismaService;
  const s3 = {
    presignPut: jest.fn().mockResolvedValue('https://put'),
    presignGet: jest.fn().mockResolvedValue('https://get'),
  } as unknown as S3PresignService;
  return { svc: new AttachmentsService(prisma, s3), prisma, s3 };
}

describe('AttachmentsService.createUpload', () => {
  const dto = { filename: 'evidencia.png', contentType: 'image/png', sizeBytes: 1234 };

  it('crea fila pending con key UUID.ext y devuelve PUT prefirmado', async () => {
    const { svc, prisma, s3 } = setup();
    (prisma.attachment.create as jest.Mock).mockResolvedValue({ id: 'a1' });
    const r = await svc.createUpload(dto, reporter);
    expect(r.uploadUrl).toBe('https://put');
    expect(r.key).toMatch(/\.png$/);
    const data = (prisma.attachment.create as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe(AttachmentStatus.pending);
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(s3.presignPut).toHaveBeenCalledWith(expect.stringMatching(/\.png$/), 'image/png', 600);
  });

  it('rechaza content_type fuera de la whitelist (422)', async () => {
    const { svc } = setup();
    await expect(
      svc.createUpload({ ...dto, contentType: 'application/x-msdownload' }, reporter),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

describe('AttachmentsService.getDownload', () => {
  it('404 si no existe', async () => {
    const { svc, prisma } = setup();
    (prisma.attachment.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(svc.getDownload('x', reporter)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reportante con adjunto de ticket propio → URL + evento', async () => {
    const { svc, prisma } = setup();
    (prisma.attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'a1',
      s3Key: 'k',
      ticketId: 't1',
    });
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ id: 't1', reporterId: 'u1' });
    const r = await svc.getDownload('a1', reporter);
    expect(r.downloadUrl).toBe('https://get');
    expect(prisma.ticketEvent.create).toHaveBeenCalled();
  });

  it('reportante con adjunto de ticket ajeno → 404', async () => {
    const { svc, prisma } = setup();
    (prisma.attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'a1',
      s3Key: 'k',
      ticketId: 't1',
    });
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ id: 't1', reporterId: 'otro' });
    await expect(svc.getDownload('a1', reporter)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pending: solo el uploader original (ajeno → 404)', async () => {
    const { svc, prisma } = setup();
    (prisma.attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'a1',
      s3Key: 'k',
      ticketId: null,
      uploaderId: 'otro',
    });
    await expect(svc.getDownload('a1', reporter)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('agente puede descargar cualquiera (sin evento si no hay ticket)', async () => {
    const { svc, prisma } = setup();
    (prisma.attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'a1',
      s3Key: 'k',
      ticketId: null,
    });
    const r = await svc.getDownload('a1', agent);
    expect(r.downloadUrl).toBe('https://get');
    expect(prisma.ticketEvent.create).not.toHaveBeenCalled();
  });
});
