// Integration test del optimistic locking (BL-021). Requiere un Postgres real
// vía DATABASE_URL (lo provee el job de migraciones en CI). Se omite en el run
// de unit tests. Ejecutar con: npm run test:int  (DATABASE_URL apuntando a la BD).
import { PrismaClient, Priority, Role, TicketType } from '@prisma/client';

const hasDb = !!process.env.DATABASE_URL;
const suite = hasDb ? describe : describe.skip;

suite('optimistic locking concurrente (BL-021)', () => {
  const prisma = new PrismaClient();
  let ticketId = '';
  let userId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const u = await prisma.user.create({
      data: { email: `conc-${Date.now()}@ticket-system.dev`, role: Role.agente },
    });
    userId = u.id;
    const t = await prisma.ticket.create({
      data: {
        type: TicketType.incidente,
        title: 'Ticket de prueba de concurrencia',
        description: 'Ticket usado para verificar el optimistic locking bajo carga concurrente.',
        severity: 2,
        impact: 2,
        priority: Priority.media,
        reporterId: u.id,
      },
    });
    ticketId = t.id;
  });

  afterAll(async () => {
    if (ticketId) {
      await prisma.ticketEvent.deleteMany({ where: { ticketId } });
      await prisma.ticket.delete({ where: { id: ticketId } }).catch(() => undefined);
    }
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('20 updates concurrentes con la misma version: exactamente 1 gana, 19 conflictan', async () => {
    const N = 20;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        prisma.ticket.updateMany({
          where: { id: ticketId, version: 0 },
          data: { escalationLevel: { increment: 1 }, version: { increment: 1 } },
        }),
      ),
    );
    const wins = results.filter((r) => r.count === 1).length;
    const conflicts = results.filter((r) => r.count === 0).length;
    expect(wins).toBe(1);
    expect(conflicts).toBe(N - 1);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.version).toBe(1); // un solo update exitoso
  });
});
