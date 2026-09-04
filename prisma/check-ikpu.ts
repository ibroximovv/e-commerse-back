/**
 * Fiskal (IKPU) ma'lumotlari to'liqligini tekshiradi.
 *
 * Payme `CheckPerformTransaction` javobida har bir buyurtma qatori uchun MXIK
 * kodini va QQS stavkasini kutadi. Ular topilmasa to'lov `-31008` bilan rad
 * etiladi - ya'ni xato TO'LOV PAYTIDA, mijozning ko'z o'ngida chiqadi. Bu
 * skript o'sha bo'shliqni oldindan ko'rsatadi.
 *
 * Ishlatish:
 *   npm run db:check:ikpu              # yetishmayotganlarni ko'rsatadi
 *   npm run db:check:ikpu -- --all     # barcha mahsulotlarni ro'yxatlaydi
 *
 * Kodlarni qanday to'ldirish - `prisma/catalog/IKPU.md`.
 */
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// `.env` ni o'zimiz yuklaymiz: bu skript Nest konteynerisiz ishlaydi, ya'ni
// `ConfigModule` PAYME_DEFAULT_* larni o'qib bermaydi.
dotenv.config();

const prisma = new PrismaClient();

const SHOW_ALL = process.argv.includes('--all');

/** `.env` dagi zaxira qiymatlar - mahsulotda bo'sh bo'lsa shular ketadi. */
const DEFAULTS = {
  ikpuCode: process.env.PAYME_DEFAULT_IKPU_CODE?.trim() ?? '',
  packageCode: process.env.PAYME_DEFAULT_PACKAGE_CODE?.trim() ?? '',
  vatPercent: process.env.PAYME_DEFAULT_VAT_PERCENT?.trim() ?? '',
  units: process.env.PAYME_DEFAULT_UNITS?.trim() ?? '',
};

function label(value: string | null | undefined): string {
  return value && value.trim() ? value.trim() : '—';
}

async function main() {
  const categories = await prisma.category.findMany({
    orderBy: { sort_order: 'asc' },
    select: { id: true, name_uz: true, name_ru: true },
  });

  const products = await prisma.product.findMany({
    where: { is_archived: false },
    orderBy: { name_uz: 'asc' },
    select: {
      sku: true,
      name_uz: true,
      category_id: true,
      ikpu_code: true,
      package_code: true,
      vat_percent: true,
      units: true,
    },
  });

  if (products.length === 0) {
    console.log(
      "Bazada faol mahsulot yo'q. Avval `npm run db:import:catalog` ni bajaring.",
    );
    return;
  }

  console.log('Fiskal maydonlar (IKPU) holati\n');

  let missingIkpu = 0;
  let missingVat = 0;

  for (const category of categories) {
    const items = products.filter((p) => p.category_id === category.id);
    if (items.length === 0) continue;

    // Butun kategoriya bir xil kod bilan to'ldirilgan bo'lsa - bitta qator
    // yetarli, uzun ro'yxat faqat chalkashlik qo'shadi.
    const codes = new Set(items.map((i) => label(i.ikpu_code)));
    const uniform = codes.size === 1 && !codes.has('—');

    // Eski (backfill qilinmagan) yozuvlarda til ustunlari bo'sh bo'lishi
    // mumkin - unda hech bo'lmasa id ko'rinsin, bo'sh sarlavha emas.
    const title =
      [category.name_ru, category.name_uz]
        .filter((n) => n?.trim())
        .join(' / ') || category.id;

    console.log(
      `${title} — ${items.length} ta` +
        (uniform ? `  ✅ IKPU: ${[...codes][0]}` : ''),
    );

    for (const item of items) {
      const noIkpu = !item.ikpu_code?.trim();
      const noVat = item.vat_percent === null;

      if (noIkpu) missingIkpu++;
      if (noVat) missingVat++;

      if (uniform && !SHOW_ALL && !noVat) continue;
      if (!SHOW_ALL && !noIkpu && !noVat) continue;

      const mark = noIkpu || noVat ? '  ⚠️ ' : '  • ';
      console.log(
        `${mark}${item.sku ?? item.name_uz}` +
          `  ikpu=${label(item.ikpu_code)}` +
          `  package=${label(item.package_code)}` +
          `  vat=${item.vat_percent ?? '—'}` +
          `  units=${item.units ?? '—'}`,
      );
    }

    console.log('');
  }

  console.log('Natija:');
  console.log(`  mahsulot          : ${products.length}`);
  console.log(`  IKPU yo'q         : ${missingIkpu}`);
  console.log(`  QQS stavkasi yo'q : ${missingVat}`);
  console.log('');

  console.log('`.env` zaxirasi:');
  console.log(`  PAYME_DEFAULT_IKPU_CODE    = ${label(DEFAULTS.ikpuCode)}`);
  console.log(`  PAYME_DEFAULT_PACKAGE_CODE = ${label(DEFAULTS.packageCode)}`);
  console.log(`  PAYME_DEFAULT_VAT_PERCENT  = ${label(DEFAULTS.vatPercent)}`);
  console.log(`  PAYME_DEFAULT_UNITS        = ${label(DEFAULTS.units)}`);
  console.log('');

  if (missingIkpu > 0 && !DEFAULTS.ikpuCode) {
    console.error(
      `❌ ${missingIkpu} ta mahsulotda IKPU yo'q va \`.env\` zaxirasi ham ` +
        "bo'sh - bu mahsulotlarni to'lay olmaysiz (-31008).",
    );
    console.error("   Qanday to'ldirish: prisma/catalog/IKPU.md");
    process.exitCode = 1;
    return;
  }

  if (missingIkpu > 0) {
    console.log(
      `⚠️ ${missingIkpu} ta mahsulotda IKPU yo'q - ular \`.env\` dagi zaxira ` +
        "kodi bilan ketadi. Chek to'g'ri bo'lishi uchun aniq kod qo'ying.",
    );
    return;
  }

  console.log('✅ Barcha mahsulotlarda IKPU kodi bor.');
}

main()
  .catch((e) => {
    console.error('\nTekshiruv xatoligi:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
