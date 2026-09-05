/**
 * `prisma/catalog/ikpu.json` dagi fiskal kodlarni bazaga yozadi.
 *
 * NIMA UCHUN FAYLDAN
 * ------------------
 * IKPU kodlarini skript o'ylab topa olmaydi - ular soliq organining
 * klassifikatoridan (tasnif.soliq.uz) olinadi va buxgalter tasdiqlaydi.
 * Noto'g'ri MXIK - soliq jarimasi. Shuning uchun kodlar tahrirlanadigan
 * faylda turadi, skript esa faqat ularni tekshirib bazaga ko'chiradi.
 *
 * IKKI DARAJA
 * -----------
 *   categories -> kategoriyaga yoziladi, ichidagi HAMMA mahsulot shuni oladi
 *   products   -> SKU bo'yicha istisno, kategoriyanikini qoplaydi
 *
 * Bo'sh `ikpu_code` - o'sha yozuv o'tkazib yuboriladi va bazadagi qiymat
 * TEGILMAYDI. Ya'ni faylni bosqichma-bosqich to'ldirsa bo'ladi.
 *
 * Ishlatish:
 *   npm run db:set:ikpu -- --dry-run   # hech nima yozmaydi, rejani ko'rsatadi
 *   npm run db:set:ikpu                # bazaga yozadi
 *   npm run db:check:ikpu              # natijani tekshiradi
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const FILE = path.join(__dirname, 'catalog', 'ikpu.json');

interface FiscalEntry {
  ikpu_code?: string;
  package_code?: string;
  vat_percent?: number;
  units?: number;
  /**
   * Kutilayotgan HS (ТН ВЭД) sarlavhasi, masalan `08413`.
   *
   * IKPU = "0" + 4 xonali HS sarlavhasi + subpozitsiya. `tasnif.soliq.uz` da
   * so'z bo'yicha qidirilganda omonimlar chiqadi: "стабилизатор" so'rovi
   * rezina uchun KIMYOVIY stabilizatorni (HS 3812) qaytaradi, kuchlanish
   * stabilizatorini emas. Prefiks shu xatoni ushlaydi.
   */
  _hs?: string;
}

interface IkpuFile {
  categories?: Record<string, FiscalEntry>;
  products?: Record<string, FiscalEntry>;
}

/** Bazaga yoziladigan qiymatlar. */
interface Resolved {
  ikpu_code: string;
  package_code: string | null;
  vat_percent: number;
  units: number | null;
}

const errors: string[] = [];
let applied = 0;
let skipped = 0;

/**
 * Bitta yozuvni tekshiradi.
 *
 * `null` qaytsa - o'tkazib yuborish kerak (kod hali yozilmagan).
 * Xato bo'lsa `errors` ga qo'shiladi va `null` qaytadi.
 */
function validate(label: string, entry: FiscalEntry): Resolved | null {
  const ikpu = (entry.ikpu_code ?? '').trim();

  if (!ikpu) {
    skipped++;
    return null;
  }

  // MXIK - 17 xonali raqam. Xato uzunlik chekni fiskallashtirmaydi va buni
  // to'lov paytida emas, hozir bilgan yaxshi.
  if (!/^\d{17}$/.test(ikpu)) {
    errors.push(
      `${label}: ikpu_code "${ikpu}" - 17 xonali RAQAM bo'lishi kerak ` +
        `(hozir ${ikpu.length} belgi)`,
    );
    return null;
  }

  // Kod to'g'ri HS guruhidanmi. Bu eng ko'p uchraydigan xatoni ushlaydi:
  // klassifikatorda so'z bo'yicha qidirilganda butunlay boshqa tovar chiqadi.
  const hs = (entry._hs ?? '').trim();
  if (hs && !ikpu.startsWith(hs)) {
    errors.push(
      `${label}: ikpu_code "${ikpu}" "${hs}" bilan boshlanmaydi ` +
        `(kutilgan HS guruhi). Boshqa tovar guruhining kodini olib ` +
        `qo'ymadingizmi? Tekshiring yoki ikpu.json dagi "_hs" ni to'g'irlang.`,
    );
    return null;
  }

  const vat = entry.vat_percent;
  if (vat === undefined || vat === null) {
    // Payme uchun majburiy: berilmasa to'lov -31008 bilan to'xtaydi.
    errors.push(`${label}: vat_percent ko'rsatilmagan (0 yoki 12 bo'lsin)`);
    return null;
  }
  if (!Number.isInteger(vat) || vat < 0 || vat > 100) {
    errors.push(`${label}: vat_percent "${vat}" - 0..100 oralig'ida butun son`);
    return null;
  }

  const pkg = (entry.package_code ?? '').trim();
  const units = entry.units;

  if (units !== undefined && units !== null && !Number.isInteger(units)) {
    errors.push(`${label}: units "${units}" - butun son bo'lishi kerak`);
    return null;
  }

  return {
    ikpu_code: ikpu,
    // Bo'sh satr va 0 - mavjud bo'lmagan klassifikatorlar. Ularni `null`
    // qilamiz, chunki chek quruvchi `null` ni umuman yubormaydi.
    package_code: pkg || null,
    vat_percent: vat,
    units: units || null,
  };
}

async function applyCategories(entries: Record<string, FiscalEntry>) {
  const slugs = Object.keys(entries).filter((k) => !k.startsWith('_'));
  if (!slugs.length) return;

  console.log('KATEGORIYALAR');

  for (const slug of slugs) {
    const category = await prisma.category.findUnique({
      where: { slug },
      select: { id: true, name_ru: true, name_uz: true },
    });

    if (!category) {
      errors.push(`kategoriya topilmadi: "${slug}"`);
      continue;
    }

    const title = category.name_ru || category.name_uz || slug;
    const data = validate(`kategoriya "${slug}"`, entries[slug]);

    if (!data) {
      console.log(`  –  ${title} — ikpu_code bo'sh, o'tkazib yuborildi`);
      continue;
    }

    if (!DRY_RUN) {
      await prisma.category.update({ where: { id: category.id }, data });
    }

    const count = await prisma.product.count({
      where: { category_id: category.id, is_archived: false },
    });

    applied++;
    console.log(
      `  ✅ ${title}` +
        `  ikpu=${data.ikpu_code}` +
        `  vat=${data.vat_percent}` +
        `  → ${count} ta mahsulot qamraldi`,
    );
  }

  console.log('');
}

async function applyProducts(entries: Record<string, FiscalEntry>) {
  const skus = Object.keys(entries).filter((k) => !k.startsWith('_'));
  if (!skus.length) return;

  console.log('MAHSULOT ISTISNOLARI');

  for (const sku of skus) {
    // SKU bazada UPPERCASE saqlanadi (ProductsService shunday normallashtiradi).
    const normalized = sku.trim().toUpperCase();
    const product = await prisma.product.findFirst({
      where: { sku: normalized },
      select: { id: true, sku: true, name_ru: true, name_uz: true },
    });

    if (!product) {
      errors.push(`mahsulot topilmadi: SKU "${sku}"`);
      continue;
    }

    const title = product.sku ?? product.name_ru ?? product.name_uz;
    const data = validate(`mahsulot "${sku}"`, entries[sku]);

    if (!data) {
      console.log(`  –  ${title} — ikpu_code bo'sh, o'tkazib yuborildi`);
      continue;
    }

    if (!DRY_RUN) {
      await prisma.product.update({ where: { id: product.id }, data });
    }

    applied++;
    console.log(
      `  ✅ ${title}  ikpu=${data.ikpu_code}  vat=${data.vat_percent}`,
    );
  }

  console.log('');
}

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Fayl topilmadi: ${FILE}`);
    process.exit(1);
  }

  let config: IkpuFile;
  try {
    config = JSON.parse(fs.readFileSync(FILE, 'utf8')) as IkpuFile;
  } catch (e) {
    console.error(
      `❌ ${FILE} - JSON xatosi: ${e instanceof Error ? e.message : e}`,
    );
    process.exit(1);
  }

  console.log(
    DRY_RUN
      ? "REJA (--dry-run: bazaga HECH NIMA yozilmaydi)\n"
      : 'Fiskal kodlarni yozish\n',
  );

  await applyCategories(config.categories ?? {});
  await applyProducts(config.products ?? {});

  if (errors.length) {
    console.error('❌ Xatolar:');
    for (const e of errors) console.error(`   ${e}`);
    console.error('');
  }

  console.log(
    `Natija: ${applied} ta yozildi, ${skipped} ta o'tkazib yuborildi` +
      (errors.length ? `, ${errors.length} ta xato` : ''),
  );

  if (errors.length) {
    process.exitCode = 1;
    return;
  }

  if (skipped > 0) {
    console.log(
      `\n⚠️  ${skipped} ta yozuvda ikpu_code bo'sh. ` +
        `To'ldiring: prisma/catalog/ikpu.json`,
    );
  }

  if (!DRY_RUN && applied > 0) {
    console.log('\nTekshiring:  npm run db:check:ikpu');
  }
}

main()
  .catch((e) => {
    console.error('\nXatolik:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
