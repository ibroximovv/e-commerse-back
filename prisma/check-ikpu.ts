/**
 * Fiskal (IKPU) ma'lumotlari to'liqligini tekshiradi.
 *
 * Payme `CheckPerformTransaction` javobida har bir buyurtma qatori uchun MXIK
 * kodini va QQS stavkasini kutadi. Ular topilmasa to'lov `-31008` bilan rad
 * etiladi - ya'ni xato TO'LOV PAYTIDA, mijozning ko'z o'ngida chiqadi. Bu
 * skript o'sha bo'shliqni oldindan ko'rsatadi.
 *
 * Qiymatlar qayerdan olinadi (shu tartibda):
 *   1. Product.ikpu_code / vat_percent / ...   - istisnolar uchun
 *   2. Category.ikpu_code / vat_percent / ...  - ASOSIY joyi
 *   3. hech qayerda yo'q -> to'lov -31008 bilan to'xtaydi
 *
 * `.env` dagi PAYME_DEFAULT_* zaxirasi OLIB TASHLANGAN: bitta kod butun
 * katalogga qo'llanardi, ya'ni stabilizator ham nasos deb fiskallashardi.
 *
 * Ishlatish:
 *   npm run db:check:ikpu              # yetishmayotganlarni ko'rsatadi
 *   npm run db:check:ikpu -- --all     # barcha mahsulotlarni ro'yxatlaydi
 *
 * Kodlarni qanday to'ldirish - `prisma/catalog/IKPU.md`.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SHOW_ALL = process.argv.includes('--all');

function label(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const text = String(value).trim();
  return text || '—';
}

async function main() {
  const categories = await prisma.category.findMany({
    orderBy: { sort_order: 'asc' },
    select: {
      id: true,
      name_uz: true,
      name_ru: true,
      ikpu_code: true,
      package_code: true,
      vat_percent: true,
      units: true,
    },
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

  let blockedProducts = 0;
  let categoriesMissingIkpu = 0;
  let categoriesMissingVat = 0;

  for (const category of categories) {
    const items = products.filter((p) => p.category_id === category.id);
    if (items.length === 0) continue;

    // Eski (backfill qilinmagan) yozuvlarda til ustunlari bo'sh bo'lishi
    // mumkin - unda hech bo'lmasa id ko'rinsin, bo'sh sarlavha emas.
    const title =
      [category.name_ru, category.name_uz]
        .filter((n) => n?.trim())
        .join(' / ') || category.id;

    const catIkpu = category.ikpu_code?.trim() ?? '';
    const catVat = category.vat_percent;

    if (!catIkpu) categoriesMissingIkpu++;
    if (catVat === null) categoriesMissingVat++;

    const catOk = catIkpu && catVat !== null;

    console.log(
      `${catOk ? '✅' : '⚠️ '} ${title} — ${items.length} ta mahsulot`,
    );
    console.log(
      `     kategoriya:  ikpu=${label(catIkpu)}` +
        `  package=${label(category.package_code)}` +
        `  vat=${label(catVat)}` +
        `  units=${label(category.units)}`,
    );

    // Kategoriya to'liq bo'lsa mahsulotlarni sanab o'tirish shart emas -
    // ularning hammasi shu qiymatlarni oladi.
    for (const item of items) {
      const ikpu = item.ikpu_code?.trim() || catIkpu;
      const vat = item.vat_percent ?? catVat;
      const blocked = !ikpu || vat === null;

      if (blocked) blockedProducts++;

      // Mahsulotning o'zida qiymat bo'lsa - bu istisno, uni ko'rsatamiz.
      const overrides =
        item.ikpu_code?.trim() ||
        item.package_code?.trim() ||
        item.vat_percent !== null ||
        item.units !== null;

      if (!SHOW_ALL && !blocked && !overrides) continue;

      const mark = blocked ? '  ⛔️ ' : overrides ? '  ↳  ' : '  •  ';
      console.log(
        `${mark}${item.sku ?? item.name_uz}` +
          `  ikpu=${label(item.ikpu_code)}` +
          `  package=${label(item.package_code)}` +
          `  vat=${label(item.vat_percent)}` +
          `  units=${label(item.units)}` +
          (blocked ? "   <- to'lov ishlamaydi" : ''),
      );
    }

    console.log('');
  }

  console.log('Natija:');
  console.log(`  mahsulot                     : ${products.length}`);
  console.log(`  IKPU'siz kategoriya          : ${categoriesMissingIkpu}`);
  console.log(`  QQS stavkasisiz kategoriya   : ${categoriesMissingVat}`);
  console.log(`  to'lab bo'lmaydigan mahsulot : ${blockedProducts}`);
  console.log('');

  if (blockedProducts > 0) {
    console.error(
      `❌ ${blockedProducts} ta mahsulotni to'lay olmaysiz (-31008): na ` +
        "mahsulotda, na uning kategoriyasida IKPU yoki QQS stavkasi bor.",
    );
    console.error(
      "   Yechim: kategoriyani to'ldiring - ichidagi hamma mahsulot shuni oladi.",
    );
    console.error("   Qo'llanma: prisma/catalog/IKPU.md");
    process.exitCode = 1;
    return;
  }

  console.log("✅ Har bir mahsulot uchun IKPU va QQS stavkasi topiladi.");
}

main()
  .catch((e) => {
    console.error('\nTekshiruv xatoligi:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
