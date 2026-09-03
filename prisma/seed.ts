/**
 * Boshlang'ich ma'lumot: faqat ADMIN hisobi.
 *
 * Katalog (kategoriyalar va mahsulotlar) bu yerda EMAS - u "Каталог 2026-III"
 * dan `prisma/catalog/*.json` orqali yuklanadi:
 *
 *   npm run db:import:catalog -- --dry-run   # avval rejani ko'ring
 *   npm run db:import:catalog                # yuklaydi
 *
 * Ilgari bu skript namunaviy elektronika katalogini (iPhone, Samsung, ichki
 * kategoriyalar) yozardi. U haqiqiy OCO katalogiga mos kelmagani va katalog
 * tekis bo'lgani uchun olib tashlandi - aks holda seed importdan keyin bazaga
 * begona kategoriyalarni qaytarib qo'yardi.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'password';

async function main() {
  console.log('Seeding database...');

  const existingAdmin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existingAdmin) {
    console.log(`Admin user already exists (${ADMIN_EMAIL}).`);
  } else {
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        password: await bcrypt.hash(ADMIN_PASSWORD, 10),
        full_name: 'System Admin',
        role: Role.ADMIN,
        is_verified: true,
        language: 'uz',
      },
    });
    console.log(`Admin user created (email: ${ADMIN_EMAIL}).`);
  }

  const [categories, products] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
  ]);

  console.log(`Catalog: ${categories} categories, ${products} products.`);
  if (categories === 0) {
    console.log('Katalog bo\'sh. Yuklash uchun: npm run db:import:catalog');
  }

  console.log('Database seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
