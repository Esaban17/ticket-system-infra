const sendMock = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { TicketsService } from './tickets.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('TicketsService', () => {
  const prisma = {
    ticket: { findMany: jest.fn() },
  } as unknown as PrismaService;

  beforeAll(() => {
    process.env.AWS_S3_BUCKET_ATTACHMENTS = 'test-bucket';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => jest.clearAllMocks());

  it('list() reads rows from the database via Prisma', async () => {
    const rows = [
      { id: 1, title: 'seed', status: 'open', priority: 'high', createdAt: new Date() },
    ];
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue(rows);

    const service = new TicketsService(prisma);
    await expect(service.list()).resolves.toBe(rows);
    expect(prisma.ticket.findMany).toHaveBeenCalledWith({ orderBy: { id: 'asc' } });
  });

  it('saveAttachment() writes to S3 and returns the object key + bucket', async () => {
    const service = new TicketsService(prisma);
    const result = await service.saveAttachment({ hello: 'world' });

    expect(result.bucket).toBe('test-bucket');
    expect(result.key).toMatch(/^uploads\/.*\.json$/);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
