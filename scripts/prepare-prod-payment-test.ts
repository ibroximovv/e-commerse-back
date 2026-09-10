/**
 * Production Payme to'lovini haqiqiy karta bilan test qilish uchun skript.
 *
 * Vazifasi:
 * 1. user@gmail.com test foydalanuvchisini yaratadi (yoki parolini yangilaydi),
 *    `is_verified: true` qiladi (OTP kodi so'ramasdan login qilish uchun).
 * 2. 2000 so'mlik haqiqiy, arxivlanmagan (sotiladigan) mahsulotni yaratadi (IKPU va fiskal ma'lumotlari bilan).
 * 3. Shu user uchun 2000 so'mlik tayyor PENDING buyurtma va Payme kassa havolasini generatsiya qiladi.
 * 4. Postman va brauzer orqali to'lovni tekshirish uchun barcha ID va parametrlarni chiqarib beradi.
 *
 * Ishga tushirish (production yoki serverda):
 *   npm run payme:prod-test
 *   npm run payme:prod-test -- --password "MyPassword123!"
 *   npm run payme:prod-test -- --price 2000
 *   npm run payme:prod-test -- --no-order    # Faqat user va mahsulotni tayyorlash
 */
import { PrismaClient, OrderStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { buildPaymeCheckoutUrl } from '../src/api/payments/payme/payme.constants';

dotenv.config();

const prisma = new PrismaClient();

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

function option(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const EMAIL = (option('email') ?? 'user@gmail.com').toLowerCase().trim();
const PASSWORD = option('password') ?? 'Password123!';
const PRICE = Number(option('price') ?? 2000);
const STOCK = Number(option('stock') ?? 1000);
const NO_ORDER = flag('no-order');

// Payme sozlamalari
const MERCHANT_ID = process.env.PAYME_MERCHANT_ID ?? '';
const PAYME_KEY = process.env.PAYME_KEY ?? '';
const ACCOUNT_FIELD = process.env.PAYME_ACCOUNT_FIELD ?? 'order_id';
const CHECKOUT_URL =
  process.env.PAYME_CHECKOUT_URL ?? 'https://checkout.paycom.uz';
const RETURN_URL = process.env.PAYME_RETURN_URL ?? 'https://ocomarket.uz/orders';

// Fiskal (IKPU) ma'lumotlari: Payme fiskallashtirishi uchun majburiy
const IKPU_CODE = option('ikpu') ?? '08413001001003001';
const PACKAGE_CODE = option('package-code') ?? '1508957';
const VAT_PERCENT = Number(option('vat') ?? 0); // 0% QQS (agar QQS to'lovchisi bo'lmasa)
const UNITS = Number(option('units') ?? 241092); // dona

async function main() {
  console.log('='.repeat(70));
  console.log('💳 PAYME PRODUCTION TO\'LOVINI TEST QILISH TAYYORGARLIGI');
  console.log('='.repeat(70));

  // 1. Sozlamalar tekshiruvi
  console.log('\n[1/4] Atrof-muhit (.env) tekshiruvi:');
  console.log(`  - PAYME_MERCHANT_ID : ${MERCHANT_ID || '❌ SOZLANMAGAN'}`);
  console.log(`  - PAYME_KEY         : ${PAYME_KEY ? '✅ Mavjud' : '❌ SOZLANMAGAN'}`);
  console.log(`  - PAYME_CHECKOUT_URL: ${CHECKOUT_URL}`);
  console.log(`  - PAYME_ACCOUNT     : ${ACCOUNT_FIELD}`);
  console.log(`  - PAYME_RETURN_URL  : ${RETURN_URL || '(kiritilmagan)'}`);

  if (CHECKOUT_URL.includes('test.paycom.uz')) {
    console.log(
      '\n⚠️  DIQQAT: PAYME_CHECKOUT_URL="https://test.paycom.uz" deb sozlangan!\n' +
        '   Haqiqiy plastik karta (Uzcard/Humo/Visa) orqali to\'lash uchun .env faylida:\n' +
        '   PAYME_CHECKOUT_URL="https://checkout.paycom.uz" bo\'lishi shart!\n',
    );
  } else {
    console.log('  - Kassa rejimi       : 🟢 PRODUCTION (haqiqiy to\'lov)');
  }

  // 2. Foydalanuvchini yaratish / yangilash
  console.log('\n[2/4] Test foydalanuvchisini tayyorlash:');
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      password: hashedPassword,
      is_verified: true, // OTP talab qilinmasligi uchun
      role: Role.USER,
      language: 'uz',
    },
    create: {
      email: EMAIL,
      password: hashedPassword,
      full_name: 'Payme Test User',
      phone: '+998901234567',
      is_verified: true,
      role: Role.USER,
      language: 'uz',
    },
  });

  console.log(`  ✅ User tayyor:`);
  console.log(`     - ID       : ${user.id}`);
  console.log(`     - Email    : ${user.email}`);
  console.log(`     - Parol    : ${PASSWORD}`);
  console.log(`     - Verified : ${user.is_verified ? 'Ha (tasdiqlangan)' : 'Yo\'q'}`);

  // 3. Kategoriya va Mahsulotni tayyorlash
  console.log('\n[3/4] 2000 so\'mlik mahsulot va fiskal ma\'lumotlarni tayyorlash:');

  // Avval bazadan mavjud aktiv kategoriyani tekshiramiz
  let category = await prisma.category.findFirst({
    where: { is_archived: false },
    select: { id: true, name_uz: true, ikpu_code: true, vat_percent: true },
  });

  if (!category) {
    category = await prisma.category.create({
      data: {
        name_uz: 'Sinov va aksessuarlar',
        name_ru: 'Тест и аксессуары',
        name_en: 'Test and accessories',
        slug: 'test-aksessuarlar',
        ikpu_code: IKPU_CODE,
        package_code: PACKAGE_CODE,
        vat_percent: VAT_PERCENT,
        units: UNITS,
        is_archived: false,
      },
      select: { id: true, name_uz: true, ikpu_code: true, vat_percent: true },
    });
  }

  const productSlug = `test-payme-product-${PRICE}`;
  const productSku = `PAYME-TEST-${PRICE}`;

  const product = await prisma.product.upsert({
    where: { slug: productSlug },
    update: {
      price: PRICE,
      final_price: PRICE,
      discount_price: null,
      stock: STOCK,
      is_archived: false,
      price_on_request: false,
      ikpu_code: IKPU_CODE,
      package_code: PACKAGE_CODE,
      vat_percent: VAT_PERCENT,
      units: UNITS,
    },
    create: {
      name_uz: `Test mahsulot (${PRICE} so'm)`,
      name_ru: `Тестовый товар (${PRICE} сум)`,
      name_en: `Test product (${PRICE} UZS)`,
      description_uz: `Payme haqiqiy to'lov tizimini tekshirish uchun test tovar`,
      description_ru: `Тестовый товар для проверки реальной оплаты Payme`,
      description_en: `Test product to verify real Payme payment`,
      slug: productSlug,
      sku: productSku,
      category_id: category.id,
      price: PRICE,
      final_price: PRICE,
      stock: STOCK,
      is_archived: false,
      price_on_request: false,
      ikpu_code: IKPU_CODE,
      package_code: PACKAGE_CODE,
      vat_percent: VAT_PERCENT,
      units: UNITS,
    },
  });

  console.log(`  ✅ Mahsulot tayyor:`);
  console.log(`     - ID        : ${product.id}`);
  console.log(`     - Nomi      : ${product.name_uz}`);
  console.log(`     - Narxi     : ${product.price} so'm (${product.price * 100} tiyin)`);
  console.log(`     - SKU       : ${product.sku}`);
  console.log(`     - Qoldiq    : ${product.stock} dona`);
  console.log(`     - IKPU/MXIK : ${product.ikpu_code} (QQS: ${product.vat_percent}%)`);

  // Foydalanuvchi savatiga qo'shish (ixtiyoriy, tozalab yangitdan solamiz)
  const cart = await prisma.cart.upsert({
    where: { user_id: user.id },
    update: {},
    create: { user_id: user.id },
  });

  await prisma.cartItem.deleteMany({ where: { cart_id: cart.id } });
  await prisma.cartItem.create({
    data: {
      cart_id: cart.id,
      product_id: product.id,
      quantity: 1,
    },
  });
  console.log(`     - Savatga qo'shildi: 1 dona (${user.email} savatida)`);

  // 4. Buyurtma yaratish va to'lov havolasini generatsiya qilish
  if (NO_ORDER) {
    console.log('\n[4/4] --no-order berilgani uchun buyurtma yaratilmadi.');
    console.log('Siz Postman orqali to\'liq oqimni (login -> add to cart -> checkout) bajarishingiz mumkin.');
  } else {
    console.log('\n[4/4] Test buyurtmasi va Payme kassa havolasini yaratish:');

    const order = await prisma.order.create({
      data: {
        user_id: user.id,
        total_amount: PRICE,
        status: OrderStatus.PENDING,
        customer_name: user.full_name,
        customer_phone: user.phone,
        shipping_address: 'Toshkent sh., Test sinov manzili 1-uy',
        payment_method: 'payme',
        notes: 'Payme prod test order (2000 UZS)',
        items: {
          create: [
            {
              product_id: product.id,
              quantity: 1,
              price_at_purchase: PRICE,
            },
          ],
        },
      },
    });

    // Zaxirani 1 taga kamaytiramiz (OrdersService mantiqi bilan bir xil)
    await prisma.product.update({
      where: { id: product.id },
      data: {
        stock: { decrement: 1 },
        sales_count: { increment: 1 },
      },
    });

    const checkoutUrl = buildPaymeCheckoutUrl({
      merchantId: MERCHANT_ID,
      accountField: ACCOUNT_FIELD,
      orderId: order.id,
      amountInSom: PRICE,
      lang: user.language || 'uz',
      checkoutUrl: CHECKOUT_URL,
      returnUrl: RETURN_URL,
    });

    console.log(`  ✅ Buyurtma yaratildi:`);
    console.log(`     - Order ID : ${order.id}`);
    console.log(`     - Summa    : ${order.total_amount} so'm`);
    console.log(`     - Holati   : ${order.status}`);

    console.log('\n' + '='.repeat(70));
    console.log('🚀 HAQIQIY TO\'LOVNI AMALGA OSHIRISH UCHUN HAVOLA:');
    console.log('='.repeat(70));
    console.log(checkoutUrl);
    console.log('='.repeat(70));

    console.log('\n📌 TO\'LOVNI TEKSHIRISH TARTIBI:');
    console.log('1. Yuqoridagi havolani brauzer yoki telefoningizda oching.');
    console.log('2. O\'zingizning haqiqiy plastik kartangizni kiriting va SMS kodni tasdiqlang.');
    console.log('3. Kartadan roppa-rosa 2000 so\'m yechiladi.');
    console.log('4. Payme sizning backend serveringizga webhook yuboradi (PerformTransaction).');
    console.log('5. Backend buyurtmani CONFIRMED va to\'lovni SUCCESSFUL deb qayd etadi.');
    console.log('\nTo\'lov holatini Postman orqali yoki quyidagi endpoint bilan tekshiring:');
    console.log(`   GET /api/payments/status/${order.id}`);
    console.log(`   GET /api/orders/${order.id}`);
  }

  console.log('\n' + '-'.repeat(70));
  console.log('📬 POSTMAN UCHUN MA\'LUMOTLAR:');
  console.log(`  Email       : ${EMAIL}`);
  console.log(`  Parol       : ${PASSWORD}`);
  console.log(`  Product ID  : ${product.id}`);
  console.log(`  Product SKU : ${product.sku}`);
  console.log('-'.repeat(70) + '\n');
}

main()
  .catch((e) => {
    console.error('❌ Xatolik yuz berdi:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
