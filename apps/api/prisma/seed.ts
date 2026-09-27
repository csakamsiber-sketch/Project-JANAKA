import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? 'csakamsiber@gmail.com').trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    console.log(`Seed admin already exists: ${existing.email}`);
    return;
  }

  const legacy = await prisma.user.findUnique({ where: { email: 'admin@janus.local' } });
  if (legacy) {
    await prisma.user.update({ where: { id: legacy.id }, data: { email } });
    console.log(`Seed admin email updated to: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      passwordHash: bcrypt.hashSync('P@ssw0rd12345', 12),
      firstName: 'System',
      lastName: 'Administrator',
      role: 'SUPERADMIN',
      isActive: true,
    },
  });

  console.log('Seed admin created successfully.');
}

main()
  .catch((error) => {
    console.error('Prisma seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
