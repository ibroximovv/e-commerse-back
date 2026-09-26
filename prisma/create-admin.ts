import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  const email = (arg('email') ?? process.env.ADMIN_EMAIL)?.trim().toLowerCase();
  const password = arg('password') ?? process.env.ADMIN_PASSWORD;
  const fullName = arg('name') ?? process.env.ADMIN_NAME ?? 'System Admin';

  if (!email || !password) {
    console.error(
      'Usage: ts-node prisma/create-admin.ts --email=admin@example.com --password=secret [--name="Full Name"]',
    );
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashed,
      role: Role.ADMIN,
      is_verified: true,
    },
    create: {
      email,
      password: hashed,
      full_name: fullName,
      role: Role.ADMIN,
      is_verified: true,
    },
  });

  console.log(`Admin ready: ${user.email} (id: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
