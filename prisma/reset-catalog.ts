/**
 * Eski katalogni bazadan tozalaydi.
 *
 * Mahsulot va kategoriyalarni o'chirishdan oldin ularga BOG'LIQ yozuvlarni
 * ham tozalash kerak: MongoDB'da tashqi kalitlar majburlanmaydi, ya'ni
 * o'chirilgan mahsulotga ishora qiluvchi savat/buyurtma qatori bazada
 * "osilib" qoladi va keyin `include: { product: true }` bilan o'qilganda
 * xatolik beradi.
 *
 * FOYDALANUVCHILARGA TEGILMAYDI - admin hisobi va parollar saqlanadi.
 *
 * Ishlatish:
 *   npm run db:reset:catalog                  # faqat hisobot, o'chirmaydi
 *   npm run db:reset:catalog -- --yes         # katalog + savat + sharhlar
 *   npm run db:reset:catalog -- --yes --with-orders   # buyurtmalarni ham
 *
 * To'liq yangilash ketma-ketligi:
 *   npm run db:reset:catalog -- --yes --with-orders
 *   npm run db:import:catalog
 */
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const CONFIRMED = args.includes('--yes');
const WITH_ORDERS = args.includes('--with-orders');

async function main() {
  const counts = {
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    cartItems: await prisma.cartItem.count(),
    reviews: await prisma.productReview.count(),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    payments: await prisma.payment.count(),
    paymeTransactions: await prisma.paymeTransaction.count(),
    users: await prisma.user.count(),
  };

  console.log('Bazadagi hozirgi holat:\n');
  console.log(`  kategoriya          : ${counts.categories}`);
  console.log(`  mahsulot            : ${counts.products}`);
  console.log(`  savat qatori        : ${counts.cartItems}`);
  console.log(`  sharh               : ${counts.reviews}`);
  console.log(`  buyurtma            : ${counts.orders}`);
  console.log(`  buyurtma qatori     : ${counts.orderItems}`);
  console.log(`  to'lov              : ${counts.payments}`);
  console.log(`  payme tranzaksiya   : ${counts.paymeTransactions}`);
  console.log(`  foydalanuvchi       : ${counts.users}  (TEGILMAYDI)`);
  console.log('');

  // Buyurtmalar mahsulotlarga ishora qiladi. Ularni qoldirib mahsulotni
  // o'chirsak, buyurtma tarixi buziladi - shuning uchun ataylab ALOHIDA
  // ruxsat so'raymiz: bu pul o'tgan yozuvlar bo'lishi mumkin.
  if (counts.orders > 0 && !WITH_ORDERS) {
    console.error(
      `❌ Bazada ${counts.orders} ta buyurtma bor. Mahsulotlarni o'chirsak ` +
        "ular yaroqsiz bo'lib qoladi.",
    );
    console.error(
      "   Buyurtmalar ham o'chirilsin: --with-orders qo'shing.\n" +
        '   Buyurtmalar saqlansin: avval eski mahsulotlarni arxivlang\n' +
        '   (`npm run db:import:catalog -- --archive-missing`).',
    );
    process.exitCode = 1;
    return;
  }

  if (!CONFIRMED) {
    console.log(
      "Hech narsa o'chirilmadi. Tasdiqlash uchun `-- --yes` qo'shing" +
        (counts.orders > 0 ? ' (va `--with-orders`).' : '.'),
    );
    return;
  }

  // Tartib muhim: avval bog'liq qatorlar, keyin mahsulot, oxirida kategoriya
  const removed = {
    cartItems: (await prisma.cartItem.deleteMany({})).count,
    reviews: (await prisma.productReview.deleteMany({})).count,
    paymeTransactions: WITH_ORDERS
      ? (await prisma.paymeTransaction.deleteMany({})).count
      : 0,
    payments: WITH_ORDERS ? (await prisma.payment.deleteMany({})).count : 0,
    orderItems: WITH_ORDERS ? (await prisma.orderItem.deleteMany({})).count : 0,
    orders: WITH_ORDERS ? (await prisma.order.deleteMany({})).count : 0,
    carts: (await prisma.cart.deleteMany({})).count,
    products: (await prisma.product.deleteMany({})).count,
    categories: (await prisma.category.deleteMany({})).count,
  };

  console.log("O'chirildi:\n");
  for (const [key, value] of Object.entries(removed)) {
    console.log(`  ${key.padEnd(20)}: ${value}`);
  }
  console.log('');
  console.log('Keyingi qadam: npm run db:import:catalog');
}

main()
  .catch((e) => {
    console.error('\nTozalash xatoligi:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
