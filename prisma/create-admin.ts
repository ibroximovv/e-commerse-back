/**
 * ADMIN hisobini yaratadi yoki mavjud foydalanuvchini ADMIN qiladi.
 * Admin panelga kirish: telefon + parol.
 *
 *   npm run db:create-admin -- --phone=+998901234567 --password=secret [--name="Full Name"]
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { cleanFullName, normalizePhone } from '../src/common/utils/phone.util';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  const phone = normalizePhone(arg('phone') ?? process.env.ADMIN_PHONE);
  const password = arg('password') ?? process.env.ADMIN_PASSWORD;
  const fullName = cleanFullName(
    arg('name') ?? process.env.ADMIN_NAME ?? 'System Admin',
  );

  if (!phone || !password || password.length < 8) {
    console.error(
      'Usage: ts-node prisma/create-admin.ts --phone=+998901234567 --password=secret123 [--name="Full Name"]\n' +
        '(parol kamida 8 belgi)',
    );
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findFirst({ where: { phone } });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { password: hashed, role: Role.ADMIN },
      })
    : await prisma.user.create({
        data: {
          phone,
          password: hashed,
          full_name: fullName,
          role: Role.ADMIN,
        },
      });

  console.log(`Admin ready: ${user.phone} (id: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
