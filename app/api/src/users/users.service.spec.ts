import { UsersService } from './users.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('UsersService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
  } as unknown as PrismaService;
  const service = new UsersService(prisma);

  afterEach(() => jest.clearAllMocks());

  it('findById queries by id', async () => {
    const u = { id: 'u1', email: 'a@b.c' };
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(u);
    await expect(service.findById('u1')).resolves.toBe(u);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('findByEmail queries by email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.findByEmail('x@y.z')).resolves.toBeNull();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'x@y.z' } });
  });

  it('create delegates to prisma', async () => {
    const data = { email: 'n@e.w', role: 'agente' as const };
    (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'u2', ...data });
    const r = await service.create(data);
    expect(r.id).toBe('u2');
    expect(prisma.user.create).toHaveBeenCalledWith({ data });
  });
});
