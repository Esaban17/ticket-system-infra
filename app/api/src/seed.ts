// ============================================================
// Seed — datos base del dominio (EP-02)
// ============================================================
// Idempotente. Crea los 3 roles de usuario y un ticket de ejemplo. Las
// sla_rules se cargan por la migración 0002_sla_seeds (no aquí).
// Se ejecuta in-cluster por el Job de seed (`node dist/seed.js`) después de
// `prisma migrate deploy`.

import { PrismaClient, Role, TicketType, Priority } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const reporter = await prisma.user.upsert({
    where: { email: 'reportante@ticket-system.dev' },
    update: {},
    create: { email: 'reportante@ticket-system.dev', role: Role.reportante },
  });
  await prisma.user.upsert({
    where: { email: 'agente@ticket-system.dev' },
    update: {},
    create: { email: 'agente@ticket-system.dev', role: Role.agente },
  });
  await prisma.user.upsert({
    where: { email: 'admin@ticket-system.dev' },
    update: {},
    create: { email: 'admin@ticket-system.dev', role: Role.administrador },
  });

  const ticketCount = await prisma.ticket.count();
  if (ticketCount === 0) {
    await prisma.ticket.create({
      data: {
        type: TicketType.incidente,
        title: 'Seed ticket — prueba de conectividad E2E',
        description:
          'Ticket sembrado para validar el camino externo → ingress → API → RDS en Delivery 3/4.',
        severity: 2,
        impact: 2,
        priority: Priority.alta,
        reporterId: reporter.id,
      },
    });
    // eslint-disable-next-line no-console
    console.log('Seed: 3 usuarios + 1 ticket creados.');
  } else {
    // eslint-disable-next-line no-console
    console.log(`Seed: usuarios asegurados; ${ticketCount} ticket(s) ya existen.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
