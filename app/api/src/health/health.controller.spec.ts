import { HttpException } from '@nestjs/common';

import { HealthController } from './health.controller';
import { PrismaService } from '@/prisma/prisma.service';

function make(queryRaw: jest.Mock) {
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  return new HealthController(prisma);
}

describe('HealthController', () => {
  it('liveness() responde ok sin tocar la BD', () => {
    const queryRaw = jest.fn();
    expect(make(queryRaw).liveness()).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('readiness() responde ready cuando SELECT 1 funciona', async () => {
    const controller = make(jest.fn().mockResolvedValue([{ '?column?': 1 }]));
    await expect(controller.readiness()).resolves.toEqual({ status: 'ready' });
  });

  it('readiness() responde 503 cuando la BD falla', async () => {
    const controller = make(jest.fn().mockRejectedValue(new Error('db down')));
    await expect(controller.readiness()).rejects.toBeInstanceOf(HttpException);
  });
});
