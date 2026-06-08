// ============================================================
// Seed — Delivery 3 E2E proof
// ============================================================
// Committed, reproducible seed mechanism (rubric: no console-inserted data).
// Run in-cluster by the db-seed Job (`node dist/seed.js`) AFTER
// `prisma migrate deploy`, so the tickets table exists and has >=1 row before
// the GET /v1/tickets endpoint is invoked.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const existing = await prisma.ticket.count();

  if (existing === 0) {
    await prisma.ticket.create({
      data: {
        title: 'Seed ticket — Delivery 3 end-to-end connectivity proof',
        status: 'open',
        priority: 'high',
      },
    });
    // eslint-disable-next-line no-console
    console.log('Seed inserted: 1 ticket.');
  } else {
    // eslint-disable-next-line no-console
    console.log(`Seed skipped: ${existing} ticket(s) already present.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
