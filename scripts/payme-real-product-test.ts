/**
 * Haqiqiy katalogdagi "Поверхностные насосы" (poverhnostnye-nasosy) toifasidagi
 * real tovarning narxini 2000 so'm qilib, to'lov uchun tayyorlovchi skript.
 *
 * Ishlatish:
 *   npm run payme:real-test
 *   npm run payme:real-test -- --vat 12      # Agar korxona QQS to'lovchisi bo'lsa
 *   npm run payme:real-test -- --sku QB-60-AL # Aniq bir SKU ni tanlash
 *   npm run payme:real-test -- --restore      # Testdan so'ng tovar narxini tiklash (price_on_request: true)
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { buildPaymeCheckoutUrl } from '../src/api/payments/payme/payme.constants';

const OrderStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;

const Role = {
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;

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
const TARGET_PRICE = 2000;
const RESTORE = flag('restore');

// Payme sozlamalari
const MERCHANT_ID = process.env.PAYME_MERCHANT_ID ?? '';
const PAYME_KEY = process.env.PAYME_KEY ?? '';
const ACCOUNT_FIELD = process.env.PAYME_ACCOUNT_FIELD ?? 'order_id';
const CHECKOUT_URL =
  process.env.PAYME_CHECKOUT_URL ?? 'https://checkout.paycom.uz';
const RETURN_URL = process.env.PAYME_RETURN_URL ?? 'https://ocomarket.uz/orders';

// Fiskal ma'lumotlar: ikpu.json dagi tasdiqlangan parametrlar
const CATEGORY_SLUG = 'poverhnostnye-nasosy';
const IKPU_CODE = option('ikpu') ?? '08413001001003001';
const VAT_PERCENT = option('vat') !== undefined ? Number(option('vat')) : 0;
const UNITS = 241092; // dona

async function main() {
  console.log('='.repeat(70));
  console.log('🛒 OCO KATALOGIDAGI HAQIQIY TOVAR BILAN PAYME TESTI (2000 SO\'M)');
  console.log('='.repeat(70));

  // 1. Kategoriyani topish va fiskal ma'lumotlarini yangilash
  console.log(`\n[1/4] "${CATEGORY_SLUG}" kategoriyasini tekshirish...`);

  let category = await prisma.category.findUnique({
    where: { slug: CATEGORY_SLUG },
  });

  if (!category) {
    // Agar baza hali katalog import qilinmagan bo'lsa, yaratamiz
    category = await prisma.category.create({
      data: {
        name_uz: 'Yer usti nasoslari',
        name_ru: 'Поверхностные насосы',
        name_en: 'Surface pumps',
        slug: CATEGORY_SLUG,
        ikpu_code: IKPU_CODE,
        package_code: null, // Bo'sh bo'lishi shart! Soxta kod xato beradi
        vat_percent: VAT_PERCENT,
        units: UNITS,
        is_archived: false,
      },
    });
    console.log(`  ✅ Kategoriya yangitdan yaratildi (${CATEGORY_SLUG})`);
  } else {
    // Mavjud kategoriyaning fiskal maydonlarini ikpu.json bo'yicha mustahkamlaymiz
    category = await prisma.category.update({
      where: { id: category.id },
      data: {
        ikpu_code: IKPU_CODE,
        package_code: null, // Noto'g'ri package_code bo'lsa tozalanadi
        vat_percent: VAT_PERCENT,
        units: UNITS,
        is_archived: false,
      },
    });
    console.log(`  ✅ Kategoriya yangilandi: ${category.name_ru || category.name_uz}`);
  }

  console.log(`     - IKPU/MXIK : ${category.ikpu_code}`);
  console.log(`     - QQS (VAT) : ${category.vat_percent}%`);
  console.log(`     - Units     : ${category.units} (dona)`);
  console.log(`     - Package   : null (ixtiyoriy, xavfsiz)`);

  // 2. Shu kategoriyadagi tovar narxini 2000 so'mga o'zgartirish
  console.log(`\n[2/4] Tovar narxini sozlash...`);

  const requestedSku = option('sku') ?? 'QB-60-AL';
  let product = await prisma.product.findFirst({
    where: {
      category_id: category.id,
      sku: requestedSku,
    },
  });

  if (!product) {
    // Agar QB-60-AL topilmasa, shu kategoriyadagi ixtiyoriy 1-mahsulotni olamiz
    product = await prisma.product.findFirst({
      where: { category_id: category.id },
    });
  }

  if (!product) {
    // Agar umuman mahsulot bo'lmasa, QB-60-AL ni yaratamiz
    product = await prisma.product.create({
      data: {
        name_uz: 'Yer usti suv nasosi QB-60 (alyuminiy)',
        name_ru: 'Поверхностный водяной насос QB-60 (алюминий)',
        name_en: 'Surface water pump QB-60 (aluminium)',
        slug: 'poverhnostnyy-vodyanoy-nasos-qb-60-alyuminiy',
        sku: 'QB-60-AL',
        category_id: category.id,
        price: TARGET_PRICE,
        final_price: TARGET_PRICE,
        stock: 100,
        price_on_request: false,
        is_archived: false,
        package_code: null,
      },
    });
  }

  if (RESTORE) {
    // Narxni katalogdagi asl holatiga qaytarish (0 va price_on_request: true)
    await prisma.product.update({
      where: { id: product.id },
      data: {
        price: 0,
        final_price: 0,
        price_on_request: true,
        package_code: null,
      },
    });
    console.log(`  🔄 Mahsulot (${product.name_ru}) narxi asl holatiga qaytarildi (narx kelishuv asosida).`);
    return;
  }

  // Mahsulot narxini 2000 so'mga o'rnatamiz
  product = await prisma.product.update({
    where: { id: product.id },
    data: {
      price: TARGET_PRICE,
      final_price: TARGET_PRICE,
      discount_price: null,
      price_on_request: false, // Sotib olish mumkin bo'lishi uchun
      stock: 100,
      is_archived: false,
      package_code: null,
    },
  });

  console.log(`  ✅ Mahsulot narxi 2000 so'mga o'zgartirildi:`);
  console.log(`     - Nomi      : ${product.name_ru} / ${product.name_uz}`);
  console.log(`     - SKU       : ${product.sku}`);
  console.log(`     - Narxi     : ${product.price} so'm`);
  console.log(`     - Stock     : ${product.stock} dona`);

  // 3. user@gmail.com ni tayyorlash
  console.log(`\n[3/4] Xaridor foydalanuvchisi (${EMAIL})...`);
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      password: hashedPassword,
      is_verified: true,
      role: Role.USER as any,
      language: 'uz',
    },
    create: {
      email: EMAIL,
      password: hashedPassword,
      full_name: 'Test Xaridor',
      phone: '+998901234567',
      is_verified: true,
      role: Role.USER as any,
      language: 'uz',
    },
  });
  console.log(`  ✅ User tayyor (${user.email} / ${PASSWORD})`);

  // 4. Buyurtma yaratish va Payme havolasini chiqarish
  console.log(`\n[4/4] 2000 so'mlik haqiqiy buyurtma va Payme havolasini yaratish...`);

  const order = await prisma.order.create({
    data: {
      user_id: user.id,
      total_amount: TARGET_PRICE,
      status: OrderStatus.PENDING as any,
      customer_name: user.full_name,
      customer_phone: user.phone,
      shipping_address: 'Toshkent sh., Test sinov manzili',
      payment_method: 'payme',
      notes: `Katalog mahsuloti (${product.sku}) uchun 2000 so'mlik test`,
      items: {
        create: [
          {
            product_id: product.id,
            quantity: 1,
            price_at_purchase: TARGET_PRICE,
          },
        ],
      },
    },
  });

  // Zaxirani yangilaymiz
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
    amountInSom: TARGET_PRICE,
    lang: user.language || 'uz',
    checkoutUrl: CHECKOUT_URL,
    returnUrl: RETURN_URL,
  });

  console.log(`  ✅ Buyurtma yaratildi:`);
  console.log(`     - Order ID : ${order.id}`);
  console.log(`     - Summa    : ${order.total_amount} so'm`);

  console.log('\n' + '='.repeat(70));
  console.log('🚀 HAQIQIY KATALOG TOVARI BILAN PAYME TO\'LOV HAVOLASI:');
  console.log('='.repeat(70));
  console.log(checkoutUrl);
  console.log('='.repeat(70));

  console.log('\n📌 QO\'LLANMA:');
  console.log('1. Yuqoridagi havolani brauzerda oching.');
  console.log('2. O\'zingizning plastik kartangizdan 2000 so\'m to\'lang.');
  console.log('3. Bu tovar rasmiy "poverhnostnye-nasosy" kategoriyasiga tegishli va');
  console.log('   Soliqdagi IKPU kodi 08413001001003001 bilan 100% mos keladi.');
  console.log('\nTest tugagach tovar narxini asl holatiga qaytarish uchun:');
  console.log('   npm run payme:real-test -- --restore\n');
}

main()
  .catch((e) => {
    console.error('❌ Xatolik yuz berdi:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
