/**
 * Payme kabinetidagi sandbox testi uchun HAQIQIY, TURG'UN buyurtma yaratadi.
 *
 * NIMA UCHUN ALOHIDA SKRIPT (`payme:selftest` bor-ku?)
 * ----------------------------------------------------
 * `payme-selftest.ts` protokolni o'zi tekshiradi va oxirida hamma narsani
 * O'CHIRIB tashlaydi. Payme kabinetidagi avtotestlar esa buning aksi: ular
 * bizning serverimizga o'zlari murojaat qiladi va shuning uchun buyurtma
 * test davomida BAZADA TURISHI kerak. Selftest yaratgan buyurtma test
 * boshlanmasdan yo'q bo'lib ketardi va manager `-31050` (buyurtma topilmadi)
 * olardi.
 *
 * SANDBOX TESTI BUYURTMANI "SARFLAYDI"
 * ------------------------------------
 * Kabinetdagi avtotest `CheckPerformTransaction -> CreateTransaction ->
 * PerformTransaction` ketma-ketligini bosib o'tadi. `PerformTransaction`dan
 * keyin buyurtma `CONFIRMED` bo'ladi, ya'ni endi to'lanadigan holatda emas -
 * keyingi urinish `-31052` qaytaradi. Shuning uchun:
 *   - `--count` bilan bir nechta buyurtma tayyorlab bering, yoki
 *   - `--reset <id>` bilan buyurtmani `PENDING` ga qaytaring.
 *
 * Test mahsuloti `is_archived: true` bilan yaratiladi - katalogda ko'rinmaydi,
 * lekin chek qurish uchun IKPU'si bor.
 *
 * Ishlatish:
 *   npm run payme:test-order                 # 1 ta buyurtma + kassa havolasi
 *   npm run payme:test-order -- --count 5    # 5 ta (avtotest bir nechtasini sarflaydi)
 *   npm run payme:test-order -- --amount 5000
 *   npm run payme:test-order -- --list       # yaratilganlarni holati bilan ko'rish
 *   npm run payme:test-order -- --reset <order_id>
 *   npm run payme:test-order -- --cleanup    # hammasini o'chirish
 */
import { PrismaClient, OrderStatus } from '@prisma/client';
import * as dotenv from 'dotenv';
import { buildPaymeCheckoutUrl } from '../src/api/payments/payme/payme.constants';

dotenv.config();

const prisma = new PrismaClient();

// `payme:selftest` dan boshqa marker: ikkala skript bir-birining ma'lumotini
// o'chirib yubormasligi kerak.
const MARKER = 'payme-test-order';

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

function option(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const DEFAULT_AMOUNT = 10000;
const amount = Number(option('amount') ?? DEFAULT_AMOUNT);
const count = Number(option('count') ?? 1);

const MERCHANT_ID = process.env.PAYME_MERCHANT_ID ?? '';
const ACCOUNT_FIELD = process.env.PAYME_ACCOUNT_FIELD ?? 'order_id';
const CHECKOUT_URL =
  process.env.PAYME_CHECKOUT_URL ?? 'https://test.paycom.uz';
const RETURN_URL = process.env.PAYME_RETURN_URL ?? '';

/**
 * Test kategoriyasining fiskal maydonlari.
 *
 * Haqiqiy kategoriyalarnikini `tasnif.soliq.uz` dan olasiz; bu yerdagilar
 * faqat sandbox uchun - chek qurilishi va yig'indi tenglik tekshiruvi
 * ishlashi kifoya. Bayroq bilan almashtirsa bo'ladi.
 */
const IKPU = option('ikpu') ?? '00702001001000000';
const PACKAGE_CODE = option('package-code') ?? '1508957';
const VAT_PERCENT = Number(option('vat') ?? 12);
const UNITS = Number(option('units') ?? 241092);

function checkoutLink(orderId: string, amountInSom: number, lang: string) {
  return buildPaymeCheckoutUrl({
    merchantId: MERCHANT_ID,
    accountField: ACCOUNT_FIELD,
    orderId,
    amountInSom,
    lang,
    checkoutUrl: CHECKOUT_URL,
    returnUrl: RETURN_URL,
  });
}

/** Test foydalanuvchisi + kategoriya + mahsulotni yaratadi yoki topadi. */
async function ensureFixtures() {
  const user = await prisma.user.upsert({
    where: { email: `${MARKER}@example.invalid` },
    update: {},
    create: {
      email: `${MARKER}@example.invalid`,
      password: MARKER,
      full_name: 'Payme Test Order',
      language: 'uz',
      is_verified: true,
    },
  });

  // Fiskal maydonlar KATEGORIYADA - server ham ularni shu yerdan o'qiydi.
  // Har safar yangilanadi, ya'ni `--ikpu` ni o'zgartirsangiz kategoriyani
  // qo'lda o'chirishga majbur bo'lmaysiz.
  const fiscal = {
    ikpu_code: IKPU || null,
    package_code: PACKAGE_CODE || null,
    vat_percent: VAT_PERCENT,
    units: UNITS || null,
  };

  const category = await prisma.category.upsert({
    where: { slug: `${MARKER}-category` },
    update: fiscal,
    create: {
      name_uz: 'Payme test',
      name_ru: 'Payme test',
      name_en: 'Payme test',
      slug: `${MARKER}-category`,
      is_archived: true,
      ...fiscal,
    },
  });

  const product = await prisma.product.upsert({
    where: { slug: `${MARKER}-product` },
    update: {},
    create: {
      name_uz: 'Payme test mahsuloti',
      name_ru: 'Тестовый товар Payme',
      name_en: 'Payme test product',
      slug: `${MARKER}-product`,
      sku: 'PAYME-TEST-ORDER',
      category_id: category.id,
      // Katalogda ko'rinmasin - bu sotiladigan tovar emas.
      is_archived: true,
      stock: 1_000_000,
      // Mahsulotda ataylab bo'sh: kategoriyadan olinishini ham sinaymiz.
    },
  });

  return { user, category, product };
}

async function createOrders() {
  if (!MERCHANT_ID) {
    console.error(
      "❌ PAYME_MERCHANT_ID sozlanmagan - kassa havolasi ishlamaydi.",
    );
    process.exit(1);
  }

  const { user, product } = await ensureFixtures();

  console.log(`Kassa      : ${CHECKOUT_URL}`);
  console.log(`account    : ${ACCOUNT_FIELD}`);
  console.log(`Summa      : ${amount} so'm = ${amount * 100} tiyin`);
  console.log(`IKPU       : ${IKPU} (kategoriyada), QQS ${VAT_PERCENT}%\n`);

  for (let i = 0; i < count; i++) {
    const order = await prisma.order.create({
      data: {
        user_id: user.id,
        total_amount: amount,
        status: OrderStatus.PENDING,
        notes: MARKER,
        items: {
          create: [
            {
              product_id: product.id,
              quantity: 1,
              price_at_purchase: amount,
            },
          ],
        },
      },
    });

    console.log(`${i + 1}) order_id : ${order.id}`);
    console.log(`   havola   : ${checkoutLink(order.id, amount, 'uz')}\n`);
  }

  console.log(
    'Yuqoridagi `order_id` ni Payme kabinetidagi avtotestga (yoki managerga)\n' +
      "bering. Har bir muvaffaqiyatli to'lov bitta buyurtmani sarflaydi -\n" +
      'yangisi uchun skriptni qayta ishga tushiring yoki `--reset` qiling.',
  );
}

async function listOrders() {
  const orders = await prisma.order.findMany({
    where: { notes: MARKER },
    orderBy: { created_at: 'desc' },
    include: { payment: true, payme_transactions: true },
  });

  if (!orders.length) {
    console.log('Test buyurtmalari yo\'q. `npm run payme:test-order` ishga tushiring.');
    return;
  }

  for (const order of orders) {
    const usable = order.status === OrderStatus.PENDING ? '✅ tayyor' : '⛔️ sarflangan';
    console.log(
      `${usable}  ${order.id}  ${order.status}  ${order.total_amount} so'm  ` +
        `tranzaksiya: ${order.payme_transactions.length}`,
    );
  }
}

/**
 * Buyurtmani qayta testga yaroqli holga keltiradi.
 *
 * `PaymeTransaction` yozuvlari ham o'chiriladi: ular bo'lmasa Payme eski
 * `id` bilan yangi `CreateTransaction` yuborganda "bu buyurtma band"
 * (`-31051`) qaytarardi.
 */
async function resetOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) {
    console.error(`❌ Buyurtma topilmadi: ${orderId}`);
    process.exit(1);
  }

  if (order.notes !== MARKER) {
    console.error(
      `❌ ${orderId} bu skript yaratgan test buyurtmasi EMAS. Haqiqiy\n` +
        "   buyurtmaning holatini qo'lda o'zgartirmaymiz.",
    );
    process.exit(1);
  }

  await prisma.paymeTransaction.deleteMany({ where: { order_id: orderId } });
  await prisma.payment.deleteMany({ where: { order_id: orderId } });
  await prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.PENDING },
  });

  console.log(`✅ ${orderId} yana PENDING - qayta test qilsa bo'ladi.`);
  console.log(`   havola: ${checkoutLink(orderId, order.total_amount, 'uz')}`);
}

async function cleanup() {
  const orders = await prisma.order.findMany({
    where: { notes: MARKER },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);

  // Tartib muhim: MongoDB'da chet el kaliti yo'q, `onDelete: Cascade` faqat
  // Prisma darajasida ishlaydi - qoldiq yozuv `include` bilan o'qilganda
  // xato beradi.
  await prisma.paymeTransaction.deleteMany({ where: { order_id: { in: ids } } });
  await prisma.payment.deleteMany({ where: { order_id: { in: ids } } });
  await prisma.orderItem.deleteMany({ where: { order_id: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  await prisma.product.deleteMany({ where: { slug: `${MARKER}-product` } });
  await prisma.category.deleteMany({ where: { slug: `${MARKER}-category` } });
  await prisma.user.deleteMany({ where: { email: `${MARKER}@example.invalid` } });

  console.log(`✅ ${ids.length} ta test buyurtmasi va fixture'lar o'chirildi.`);
}

async function main() {
  const resetId = option('reset');

  if (flag('cleanup')) return cleanup();
  if (flag('list')) return listOrders();
  if (resetId) return resetOrder(resetId);
  return createOrders();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
