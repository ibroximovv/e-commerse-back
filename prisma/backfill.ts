/**
 * Bir martalik migratsiya: mavjud MongoDB hujjatlarini joriy sxemaga keltiradi.
 *
 * Ikki ish qiladi:
 *  1. Yetishmayotgan maydonlarni to'ldiradi (`slug`, `final_price`,
 *     `discount_percent`, `popularity_score` ...);
 *  2. BIR TILLI hujjatlarni UCH TILLIga o'giradi: `name` -> `name_uz`/`name_ru`/
 *     `name_en`, `description` -> `description_*`, `attributes[].key/value/unit`
 *     -> `key_*`/`value_*`/`unit_*`, hamda olib tashlangan `parent_id` ni yo'q qiladi.
 *
 * Matn qaysi tilga tegishli ekani KIRILL harflari bo'yicha taxmin qilinadi:
 * kirill bo'lsa `*_ru`, aks holda `*_en`. Qolgan tillar bo'sh qoldiriladi -
 * `pickLocalized` fallback zanjiri ularni to'ldirilgan tildan ko'rsatadi va
 * admin panelda "hali tarjima qilinmagan" degani ko'rinib turadi.
 *
 * Bu maydonlar schema'da majburiy, shuning uchun Prisma orqali o'qishning o'zi
 * xato beradi - skript `$runCommandRaw` (to'g'ridan-to'g'ri MongoDB buyruqlari)
 * bilan ishlaydi.
 *
 * Ishlatish (bir marta, `prisma db push` dan keyin):
 *   npx ts-node prisma/backfill.ts
 *
 * Skript idempotent - bir necha marta ishga tushirsa ham xavfsiz.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

function uniqueSlug(base: string, taken: Set<string>, fallback: string) {
  let candidate = slugify(base) || fallback;
  const original = candidate;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${original}-${suffix++}`;
  }
  taken.add(candidate);
  return candidate;
}

/** Matnda kirill harfi bormi - qaysi til ustuniga yozishni shu hal qiladi. */
function isCyrillic(value: string): boolean {
  return /[\u0400-\u04FF]/.test(value);
}

/**
 * Bir tilli matnni uch tilli ustunlarga yoyadi.
 * Aniqlangan til to'ldiriladi, qolgani bo'sh - fallback ularni qoplaydi.
 */
function localize(field: string, value: unknown): Record<string, string> {
  const text = typeof value === 'string' ? value.trim() : '';
  const isRussian = isCyrillic(text);

  return {
    // O'zbekcha matnni avtomatik ajratib bo'lmaydi (lotin yozuvi ingliz bilan
    // bir xil), shuning uchun `uz` doim bo'sh qoladi va admin to'ldiradi.
    [`${field}_uz`]: '',
    [`${field}_ru`]: isRussian ? text : '',
    [`${field}_en`]: isRussian ? '' : text,
  };
}

/** Hujjat allaqachon ko'p tilli ko'rinishga o'tganmi. */
function alreadyLocalized(doc: any, field: string): boolean {
  return (
    typeof doc[`${field}_uz`] === 'string' &&
    typeof doc[`${field}_ru`] === 'string' &&
    typeof doc[`${field}_en`] === 'string'
  );
}

async function dropObsoleteIndexes() {
  const obsolete: Array<{ collection: string; index: string }> = [
    { collection: 'Category', index: 'Category_name_key' },
    { collection: 'Category', index: 'Category_parent_id_idx' },
    { collection: 'Category', index: 'Category_parent_id_is_archived_idx' },
    { collection: 'Product', index: 'Product_name_idx' },
    { collection: 'Payment', index: 'Payment_transaction_id_key' },
  ];
  for (const { collection, index } of obsolete) {
    try {
      await prisma.$runCommandRaw({
        dropIndexes: collection,
        index,
      });
      console.log(`Index ${index} dropped from ${collection}`);
    } catch {
      // Index might already be dropped or not exist
    }
  }
}

async function findAll(collection: string): Promise<any[]> {
  const result: any = await prisma.$runCommandRaw({
    find: collection,
    filter: {},
    batchSize: 100000,
  });
  return result?.cursor?.firstBatch ?? [];
}

async function applyUpdates(
  collection: string,
  updates: Array<{ q: any; u: any }>,
) {
  if (!updates.length) return 0;

  // Katta to'plamlarni bo'lib yuboramiz
  const CHUNK = 500;
  let applied = 0;

  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const result: any = await prisma.$runCommandRaw({
      update: collection,
      updates: chunk.map((item) => ({ ...item, multi: false })),
    });
    if (result?.writeErrors?.length) {
      console.error(`Write errors on ${collection}:`, result.writeErrors);
    }
    applied += Number(result?.nModified ?? 0);
  }

  return applied;
}

async function backfillCategories() {
  const docs = await findAll('Category');
  const taken = new Set<string>(
    docs.map((doc) => doc.slug).filter((slug): slug is string => !!slug),
  );

  const updates = docs
    .map((doc) => {
      const set: Record<string, unknown> = {};
      const unset: Record<string, ''> = {};

      if (!doc.slug) {
        set.slug = uniqueSlug(doc.name ?? '', taken, `category-${doc._id}`);
      }
      if (doc.icon === undefined) set.icon = null;
      if (doc.is_featured === undefined) set.is_featured = false;
      if (doc.sort_order === undefined) set.sort_order = 0;

      // Bir tilli -> uch tilli
      if (!alreadyLocalized(doc, 'name')) {
        Object.assign(set, localize('name', doc.name));
      }
      if (!alreadyLocalized(doc, 'description')) {
        Object.assign(set, localize('description', doc.description));
      }
      if (doc.name !== undefined) unset.name = '';
      if (doc.description !== undefined) unset.description = '';

      // Kategoriya daraxti olib tashlandi
      if (doc.parent_id !== undefined) unset.parent_id = '';

      const update: Record<string, unknown> = {};
      if (Object.keys(set).length) update.$set = set;
      if (Object.keys(unset).length) update.$unset = unset;

      return Object.keys(update).length
        ? { q: { _id: doc._id }, u: update }
        : null;
    })
    .filter((item): item is { q: any; u: any } => item !== null);

  const applied = await applyUpdates('Category', updates);
  console.log(
    `Category: ${docs.length} ta hujjat tekshirildi, ${applied} tasi yangilandi.`,
  );
}

async function backfillProducts() {
  const docs = await findAll('Product');
  const taken = new Set<string>(
    docs.map((doc) => doc.slug).filter((slug): slug is string => !!slug),
  );

  const updates = docs
    .map((doc) => {
      const set: Record<string, unknown> = {};
      const unset: Record<string, ''> = {};

      if (!doc.slug) {
        set.slug = uniqueSlug(doc.name ?? '', taken, `product-${doc._id}`);
      }
      if (doc.sku === undefined) set.sku = null;
      if (doc.brand === undefined) set.brand = null;
      if (doc.tags === undefined) set.tags = [];
      if (doc.discount_price === undefined) set.discount_price = null;
      if (doc.price === undefined) set.price = 0;
      if (doc.price_on_request === undefined) set.price_on_request = false;
      if (doc.is_top === undefined) set.is_top = false;
      if (doc.is_featured === undefined) set.is_featured = false;

      const salesCount = doc.sales_count ?? 0;
      const viewCount = doc.view_count ?? 0;
      const rating = doc.rating ?? 0;
      const ratingCount = doc.rating_count ?? 0;

      if (doc.sales_count === undefined) set.sales_count = salesCount;
      if (doc.view_count === undefined) set.view_count = viewCount;
      if (doc.rating === undefined) set.rating = rating;
      if (doc.rating_count === undefined) set.rating_count = ratingCount;

      // Hosila narx maydonlari
      const price = Number(doc.price ?? 0);
      const discountPrice =
        doc.discount_price === null || doc.discount_price === undefined
          ? null
          : Number(doc.discount_price);
      const hasDiscount = discountPrice !== null && discountPrice < price;
      const finalPrice = hasDiscount ? (discountPrice as number) : price;

      if (doc.final_price === undefined || doc.final_price !== finalPrice) {
        set.final_price = Math.round(finalPrice * 100) / 100;
      }

      const discountPercent =
        hasDiscount && price > 0
          ? Math.round(((price - finalPrice) / price) * 100)
          : 0;
      if (doc.discount_percent !== discountPercent) {
        set.discount_percent = discountPercent;
      }

      const popularityScore =
        Math.round(
          (salesCount * 100 + rating * ratingCount * 20 + viewCount) * 100,
        ) / 100;
      if (doc.popularity_score !== popularityScore) {
        set.popularity_score = popularityScore;
      }

      // Bir tilli -> uch tilli
      if (!alreadyLocalized(doc, 'name')) {
        Object.assign(set, localize('name', doc.name));
      }
      if (!alreadyLocalized(doc, 'description')) {
        Object.assign(set, localize('description', doc.description));
      }
      if (doc.name !== undefined) unset.name = '';
      if (doc.description !== undefined) unset.description = '';

      // Xarakteristikalar: {key, value, unit} -> {key_*, value_*, unit_*}
      if (Array.isArray(doc.attributes)) {
        const needsMigration = doc.attributes.some(
          (attr: any) => attr && attr.key !== undefined,
        );
        if (needsMigration) {
          set.attributes = doc.attributes.map((attr: any) => ({
            ...localize('key', attr?.key),
            ...localize('value', attr?.value),
            ...localize('unit', attr?.unit),
          }));
        }
      }

      const update: Record<string, unknown> = {};
      if (Object.keys(set).length) update.$set = set;
      if (Object.keys(unset).length) update.$unset = unset;

      return Object.keys(update).length
        ? { q: { _id: doc._id }, u: update }
        : null;
    })
    .filter((item): item is { q: any; u: any } => item !== null);

  const applied = await applyUpdates('Product', updates);
  console.log(
    `Product: ${docs.length} ta hujjat tekshirildi, ${applied} tasi yangilandi.`,
  );
}

async function main() {
  console.log('Backfill boshlandi...');
  await dropObsoleteIndexes();
  await backfillCategories();
  await backfillProducts();
  console.log('Backfill tugadi.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
