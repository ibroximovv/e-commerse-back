/**
 * "Каталог 2026-III" (ООО «OCO») ni bazaga yuklaydi.
 *
 * Ma'lumot manbasi - `prisma/catalog/categories.json` va `prisma/catalog/products.json`.
 * Skript IDEMPOTENT: bir necha marta ishga tushirsa ham nusxa yaratmaydi.
 *
 *   Kategoriya kaliti - `slug`.
 *   Mahsulot kaliti   - `sku` (topilmasa `slug`).
 *
 * Nom, tavsif va xarakteristikalar JSON'da `{uz, ru, en}` ko'rinishida keladi va
 * bazadagi `name_uz` / `name_ru` / `name_en` ustunlariga yoyiladi.
 *
 * PRODUCTION UCHUN MUHIM
 * ----------------------
 * Mavjud mahsulot yangilanganda faqat KATALOG maydonlari qayta yoziladi
 * (nom, tavsif, brend, teglar, xarakteristikalar, kategoriya). Admin panelda
 * qo'yilgan `price`, `stock`, `is_top`, `is_featured`, reyting va sotuv
 * statistikasi TEGILMAYDI - aks holda har bir import narxlarni nolga qaytarardi.
 * Narxlarni ham katalogdagi holatga qaytarish kerak bo'lsa `--reset-pricing`.
 *
 * Ishlatish:
 *   npm run db:import:catalog -- --dry-run     # hech nima yozmaydi, faqat rejani ko'rsatadi
 *   npm run db:import:catalog                  # yuklaydi
 *   npm run db:import:catalog -- --reset-pricing
 *   npm run db:import:catalog -- --archive-missing
 *
 * Eslatma: `prisma db push` (yoki `prisma generate`) shu skriptdan OLDIN
 * bajarilgan bo'lishi kerak - til ustunlari yangi maydonlar.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// JSON sxemasi
// ---------------------------------------------------------------------------

/** JSON'dagi ko'p tilli matn. Kamida bitta til to'ldirilgan bo'lishi kerak. */
interface LocalizedInput {
  uz?: string | null;
  ru?: string | null;
  en?: string | null;
}

interface CategoryInput {
  name: LocalizedInput;
  slug?: string;
  description?: LocalizedInput | null;
  image?: string | null;
  icon?: string | null;
  sort_order?: number;
  is_featured?: boolean;
}

interface AttributeInput {
  key: LocalizedInput;
  value: LocalizedInput;
  unit?: LocalizedInput | null;
}

interface ProductInput {
  catalog_no?: number;
  name: LocalizedInput;
  slug?: string;
  sku?: string | null;
  /** Kategoriya `slug`i. */
  category: string;
  brand?: string | null;
  description?: LocalizedInput | null;
  tags?: string[];
  price?: number;
  price_on_request?: boolean;
  discount_price?: number | null;
  stock?: number;
  images?: string[];
  attributes?: AttributeInput[];
  is_top?: boolean;
  is_featured?: boolean;
  // Fiskalizatsiya (Payme cheki). Bo'sh qolsa `.env` dagi PAYME_DEFAULT_* ishlaydi.
  ikpu_code?: string | null;
  package_code?: string | null;
  vat_percent?: number | null;
  units?: number | null;
}

// ---------------------------------------------------------------------------
// Yordamchilar (src/common/utils/slug.util.ts bilan bir xil mantiq)
// ---------------------------------------------------------------------------

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya', ғ: 'g', қ: 'q', ҳ: 'h', ў: 'o',
  'ʻ': '', 'ʼ': '', '‘': '', '’': '', "'": '', '`': '',
};

function slugify(value: string): string {
  let out = '';
  for (const char of (value ?? '').toLowerCase().trim()) {
    out += TRANSLIT[char] !== undefined ? TRANSLIT[char] : char;
  }
  return out
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

const LANGS = ['uz', 'ru', 'en'] as const;
type LangCode = (typeof LANGS)[number];

/**
 * `src/common/i18n/locale.ts` dagi `pickLocalized` bilan bir xil fallback:
 * so'ralgan til -> uz -> ru -> en.
 */
function pick(value: LocalizedInput | null | undefined, lang: LangCode) {
  if (!value) return null;
  for (const candidate of [lang, ...LANGS] as LangCode[]) {
    const text = value[candidate];
    if (typeof text === 'string' && text.trim() !== '') return text;
  }
  return null;
}

/** `{uz, ru, en}` -> `{<field>_uz, <field>_ru, <field>_en}` (majburiy maydon). */
function spreadRequired<F extends string>(field: F, value: LocalizedInput) {
  return Object.fromEntries(
    LANGS.map((lang) => [`${field}_${lang}`, pick(value, lang) ?? '']),
  ) as Record<`${F}_${LangCode}`, string>;
}

/** Xuddi shunday, lekin bo'sh bo'lsa `null` yoziladi. */
function spreadOptional<F extends string>(
  field: F,
  value: LocalizedInput | null | undefined,
) {
  return Object.fromEntries(
    LANGS.map((lang) => [`${field}_${lang}`, pick(value, lang)]),
  ) as Record<`${F}_${LangCode}`, string | null>;
}

/** SKU ni ProductsService bilan bir xil normallashtiradi. */
function normalizeSku(sku?: string | null): string | null {
  const trimmed = (sku ?? '').trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** src/api/products/products.pricing.ts bilan bir xil. */
function computePriceFields(price: number, discountPrice?: number | null) {
  const hasDiscount =
    discountPrice !== null &&
    discountPrice !== undefined &&
    discountPrice >= 0 &&
    discountPrice < price;

  const finalPrice = hasDiscount ? discountPrice : price;

  return {
    final_price: round2(finalPrice),
    discount_percent:
      hasDiscount && price > 0
        ? Math.round(((price - finalPrice) / price) * 100)
        : 0,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string): string | undefined => {
  const withEquals = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (withEquals) return withEquals.split('=').slice(1).join('=');
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};

const OPTIONS = {
  dryRun: flag('dry-run'),
  /** Katalog narx/zaxira qiymatlarini mavjud yozuvlarga ham majburan yozadi. */
  resetPricing: flag('reset-pricing'),
  /** Katalogda yo'q, lekin shu import yaratgan mahsulotlarni arxivlaydi. */
  archiveMissing: flag('archive-missing'),
  dir: option('dir') ?? path.join(__dirname, 'catalog'),
};

const stats = {
  categoriesCreated: 0,
  categoriesUpdated: 0,
  productsCreated: 0,
  productsUpdated: 0,
  productsArchived: 0,
};

function log(...args: unknown[]) {
  console.log(...args);
}

function readJson<T>(file: string): T {
  const full = path.resolve(OPTIONS.dir, file);
  if (!fs.existsSync(full)) {
    throw new Error(`Fayl topilmadi: ${full}`);
  }
  return JSON.parse(fs.readFileSync(full, 'utf8')) as T;
}

/**
 * Katalog rasmlarini `uploads/catalog/` ga ko'chiradi.
 *
 * `uploads/` git'da kuzatilmaydi (foydalanuvchi yuklagan fayllar joyi),
 * shuning uchun katalog suratlari repoda `prisma/catalog/images/` da yotadi
 * va import paytida statik papkaga ko'chiriladi. Aks holda yangi serverda
 * mahsulotlar bazada bo'lib, rasmlari 404 qaytarardi.
 */
function copyCatalogImages(): { copied: number; total: number } {
  const source = path.resolve(OPTIONS.dir, 'images');
  if (!fs.existsSync(source)) return { copied: 0, total: 0 };

  const files = fs.readdirSync(source).filter((f) => !f.startsWith('.'));
  const target = path.resolve(
    process.env.UPLOAD_PATH ?? './uploads',
    'catalog',
  );

  if (OPTIONS.dryRun) return { copied: 0, total: files.length };

  fs.mkdirSync(target, { recursive: true });

  let copied = 0;
  for (const file of files) {
    const from = path.join(source, file);
    const to = path.join(target, file);
    // Mavjud faylni faqat manba yangiroq bo'lsa qayta yozamiz
    const stale =
      !fs.existsSync(to) ||
      fs.statSync(from).mtimeMs > fs.statSync(to).mtimeMs ||
      fs.statSync(from).size !== fs.statSync(to).size;
    if (!stale) continue;
    fs.copyFileSync(from, to);
    copied++;
  }

  return { copied, total: files.length };
}

// ---------------------------------------------------------------------------
// Kategoriyalar
// ---------------------------------------------------------------------------

/**
 * Kategoriyalarni yuklaydi va `slug -> id` xaritasini qaytaradi.
 * Katalog tekis - ichki kategoriya yo'q, shuning uchun bir o'tishda bajariladi.
 */
async function importCategories(inputs: CategoryInput[]) {
  const registry = new Map<string, string>();

  for (const input of inputs) {
    const slug = input.slug?.trim() || slugify(pick(input.name, 'ru') ?? '');
    const existing = await prisma.category.findUnique({ where: { slug } });
    const label = pick(input.name, 'ru') ?? slug;

    const data = {
      ...spreadRequired('name', input.name),
      ...spreadOptional('description', input.description),
      slug,
      image: input.image ?? null,
      icon: input.icon ?? null,
      sort_order: input.sort_order ?? 0,
      is_featured: input.is_featured ?? false,
      is_archived: false,
    };

    if (OPTIONS.dryRun) {
      log(`  ${existing ? '~' : '+'} kategoriya: ${label} (${slug})`);
      registry.set(slug, existing?.id ?? `dry-${slug}`);
      existing ? stats.categoriesUpdated++ : stats.categoriesCreated++;
      continue;
    }

    const saved = existing
      ? await prisma.category.update({ where: { id: existing.id }, data })
      : await prisma.category.create({ data });

    existing ? stats.categoriesUpdated++ : stats.categoriesCreated++;
    log(`  ${existing ? '~' : '+'} kategoriya: ${label} (${saved.slug})`);

    registry.set(saved.slug, saved.id);
  }

  return registry;
}

// ---------------------------------------------------------------------------
// Mahsulotlar
// ---------------------------------------------------------------------------

/** Bazada band bo'lmagan slug qaytaradi. */
async function resolveSlug(source: string, excludeId?: string) {
  const base = slugify(source) || 'product';
  let candidate = base;

  for (let suffix = 2; suffix < 500; suffix++) {
    const existing = await prisma.product.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${suffix}`;
  }

  return `${base}-${Date.now()}`;
}

async function importProducts(
  inputs: ProductInput[],
  categoryIds: Map<string, string>,
) {
  const touchedIds: string[] = [];

  for (const input of inputs) {
    const label = pick(input.name, 'ru') ?? input.sku ?? '(nomsiz)';

    const categoryId = categoryIds.get(input.category);
    if (!categoryId) {
      throw new Error(
        `"${label}" uchun kategoriya topilmadi: "${input.category}"`,
      );
    }

    const sku = normalizeSku(input.sku);
    const onRequest = input.price_on_request ?? false;
    const price = onRequest ? 0 : (input.price ?? 0);
    const discountPrice = onRequest ? null : (input.discount_price ?? null);

    if (discountPrice !== null && discountPrice >= price) {
      throw new Error(
        `"${label}": discount_price (${discountPrice}) price (${price}) dan kichik bo'lishi kerak`,
      );
    }

    // Avval SKU bo'yicha, keyin slug bo'yicha qidiramiz
    const existing =
      (sku
        ? await prisma.product.findFirst({
            where: { sku: { equals: sku, mode: 'insensitive' } },
          })
        : null) ??
      (await prisma.product.findUnique({
        where: { slug: input.slug?.trim() || slugify(label) },
      }));

    // Katalogdan keladigan - ya'ni har doim qayta yoziladigan - maydonlar
    const catalogFields = {
      ...spreadRequired('name', input.name),
      ...spreadOptional('description', input.description),
      sku,
      brand: input.brand ?? null,
      tags: input.tags ?? [],
      images: input.images ?? [],
      ikpu_code: input.ikpu_code ?? null,
      package_code: input.package_code ?? null,
      vat_percent: input.vat_percent ?? null,
      units: input.units ?? null,
      attributes: (input.attributes ?? []).map((attr) => ({
        ...spreadRequired('key', attr.key),
        ...spreadRequired('value', attr.value),
        ...spreadOptional('unit', attr.unit),
      })),
      category_id: categoryId,
    };

    // Narx/zaxira/bayroqlar - faqat yangi yozuvda yoki --reset-pricing bilan
    const pricingFields = {
      price,
      price_on_request: onRequest,
      discount_price: discountPrice,
      ...computePriceFields(price, discountPrice),
      stock: input.stock ?? 0,
      is_top: input.is_top ?? false,
      is_featured: input.is_featured ?? false,
    };

    if (OPTIONS.dryRun) {
      log(`  ${existing ? '~' : '+'} ${label}  [${sku ?? '-'}]`);
      existing ? stats.productsUpdated++ : stats.productsCreated++;
      if (existing) touchedIds.push(existing.id);
      continue;
    }

    if (existing) {
      const data: Prisma.ProductUncheckedUpdateInput = {
        ...catalogFields,
        is_archived: false,
        ...(OPTIONS.resetPricing ? pricingFields : {}),
      };

      const saved = await prisma.product.update({
        where: { id: existing.id },
        data,
      });
      touchedIds.push(saved.id);
      stats.productsUpdated++;
      log(`  ~ ${saved.name_ru}  [${saved.sku ?? '-'}]`);
    } else {
      const saved = await prisma.product.create({
        data: {
          ...catalogFields,
          ...pricingFields,
          is_archived: false,
          slug: await resolveSlug(input.slug?.trim() || label),
        },
      });
      touchedIds.push(saved.id);
      stats.productsCreated++;
      log(`  + ${saved.name_ru}  [${saved.sku ?? '-'}]`);
    }
  }

  return touchedIds;
}

/**
 * Katalog kategoriyalarida turgan, lekin bu importda uchramagan mahsulotlarni
 * arxivlaydi (o'chirmaydi - buyurtma tarixi buzilmasligi uchun).
 */
async function archiveMissing(touchedIds: string[], categoryIds: string[]) {
  const result = await prisma.product.updateMany({
    where: {
      category_id: { in: categoryIds },
      id: { notIn: touchedIds },
      is_archived: false,
    },
    data: { is_archived: true },
  });

  stats.productsArchived = result.count;
}

// ---------------------------------------------------------------------------

async function main() {
  log('Katalog importi boshlandi.');
  log(`  manba : ${path.resolve(OPTIONS.dir)}`);
  log(
    `  rejim : ${OPTIONS.dryRun ? 'DRY-RUN (bazaga yozilmaydi)' : 'YOZISH'}` +
      `${OPTIONS.resetPricing ? ' + narxlarni qayta yozish' : ''}` +
      `${OPTIONS.archiveMissing ? ' + yo‘qlarni arxivlash' : ''}`,
  );
  log('');

  const categoriesFile = readJson<{ categories: CategoryInput[] }>(
    'categories.json',
  );
  const productsFile = readJson<{ products: ProductInput[] }>('products.json');

  const images = copyCatalogImages();
  if (images.total > 0) {
    log(
      `Rasmlar: ${images.total} ta topildi, ${images.copied} ta uploads/catalog/ ga ko'chirildi.`,
    );
    log('');
  }

  log(`Kategoriyalar (${categoriesFile.categories.length} ta):`);
  const registry = await importCategories(categoriesFile.categories);

  log('');
  log(`Mahsulotlar (${productsFile.products.length} ta):`);
  const touchedIds = await importProducts(productsFile.products, registry);

  if (OPTIONS.archiveMissing && !OPTIONS.dryRun) {
    const categoryIds = [
      ...new Set(
        categoriesFile.categories
          .map((c) => registry.get(c.slug ?? slugify(pick(c.name, 'ru') ?? '')))
          .filter((id): id is string => !!id),
      ),
    ];
    await archiveMissing(touchedIds, categoryIds);
  }

  log('');
  log('Natija:');
  log(
    `  kategoriya : +${stats.categoriesCreated} yangi, ~${stats.categoriesUpdated} yangilandi`,
  );
  log(
    `  mahsulot   : +${stats.productsCreated} yangi, ~${stats.productsUpdated} yangilandi`,
  );
  if (OPTIONS.archiveMissing) {
    log(`  arxivlandi : ${stats.productsArchived}`);
  }
  if (OPTIONS.dryRun) {
    log('');
    log('DRY-RUN edi - bazaga hech narsa yozilmadi.');
  }
}

main()
  .catch((e) => {
    console.error('\nImport xatoligi:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
