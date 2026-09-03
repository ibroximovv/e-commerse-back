/**
 * Ko'p tillilik yadrosi.
 *
 * Katalog matnlari bazada alohida ustunlarda saqlanadi (`name_uz`, `name_ru`,
 * `name_en`). Javob qaytishdan oldin shu uchliklar so'ralgan tilga qarab bitta
 * maydonga yig'iladi: `{ name_uz, name_ru, name_en }` -> `{ name }`.
 *
 * Ilgari tarjima ingliz kalitli lug'at ustida ishlar edi, shuning uchun bazadagi
 * ruscha nomlar lug'atda topilmay o'zgarmay qaytardi. Endi lug'at faqat tizim
 * xabarlari va xatolar uchun ishlatiladi.
 */

export const SUPPORTED_LANGUAGES = ['uz', 'ru', 'en'] as const;

export type Lang = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Lang = 'uz';

/**
 * So'ralgan tilda matn bo'lmasa shu tartibda qidiriladi.
 * Katalog rus tilida kelgani uchun `ru` `en` dan oldin turadi.
 */
const FALLBACK_ORDER: readonly Lang[] = ['uz', 'ru', 'en'];

/** `_uz` / `_ru` / `_en` bilan tugaydigan maydonlarni ajratadi. */
const LOCALIZED_FIELD_RE = /^(.+)_(uz|ru|en)$/;

export function isSupportedLanguage(value: unknown): value is Lang {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value.toLowerCase())
  );
}

/** Har qanday kirishni qo'llab-quvvatlanadigan tilga keltiradi. */
export function normalizeLanguage(value: unknown): Lang {
  if (typeof value !== 'string') return DEFAULT_LANGUAGE;
  const normalized = value.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLanguage(normalized) ? normalized : DEFAULT_LANGUAGE;
}

/**
 * `{ name_uz, name_ru, name_en }` dan bitta qiymat tanlaydi.
 * So'ralgan til bo'sh bo'lsa fallback zanjiri bo'ylab tushadi.
 */
export function pickLocalized(
  variants: Partial<Record<Lang, string | null | undefined>>,
  lang: Lang,
): string | null {
  const candidates: Lang[] = [lang, ...FALLBACK_ORDER];

  for (const candidate of candidates) {
    const value = variants[candidate];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }

  return null;
}

/**
 * Obyekt (yoki massiv) ichidagi barcha til uchliklarini yig'ib, bitta tilga
 * keltiradi. Xom ustunlar (`name_uz` ...) javobdan olib tashlanadi.
 *
 * `Date`, `Buffer` va boshqa maxsus obyektlar o'zgartirilmasdan qaytariladi -
 * ular ichida tarjima qilinadigan maydon bo'lmaydi.
 */
export function localizeObject<T>(input: T, lang: Lang): T {
  return localizeValue(input, lang, new WeakMap()) as T;
}

function localizeValue(
  value: unknown,
  lang: Lang,
  seen: WeakMap<object, unknown>,
): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  // Sikllik havolalarda cheksiz rekursiyaga tushmaslik uchun
  const cached = seen.get(value);
  if (cached !== undefined) return cached;

  if (Array.isArray(value)) {
    const output: unknown[] = [];
    seen.set(value, output);
    for (const item of value) output.push(localizeValue(item, lang, seen));
    return output;
  }

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  seen.set(value, result);

  // 1-bosqich: qaysi maydonlar til uchligiga tegishli ekanini aniqlaymiz
  const groups = collectLocalizedGroups(source);

  for (const [key, item] of Object.entries(source)) {
    // Parol hech qachon javobga tushmasligi kerak
    if (key === 'password') continue;

    const match = LOCALIZED_FIELD_RE.exec(key);
    if (match && groups.has(match[1])) continue; // xom ustun tashlab ketiladi

    result[key] = localizeValue(item, lang, seen);
  }

  // 2-bosqich: yig'ilgan uchliklarni bitta maydon qilib qo'shamiz
  for (const [base, variants] of groups) {
    result[base] = pickLocalized(variants, lang);
  }

  return result;
}

/**
 * Obyektdagi `X_uz` / `X_ru` / `X_en` maydonlarini `X` bazasi bo'yicha guruhlaydi.
 * Agar obyektda `X` nomli haqiqiy maydon ham bo'lsa, guruh hosil qilinmaydi -
 * mavjud ma'lumot ustiga yozib yubormaslik uchun.
 */
function collectLocalizedGroups(source: Record<string, unknown>) {
  const groups = new Map<string, Partial<Record<Lang, string | null>>>();

  for (const [key, value] of Object.entries(source)) {
    const match = LOCALIZED_FIELD_RE.exec(key);
    if (!match) continue;

    const [, base, lang] = match;
    if (base in source) continue;
    if (value !== null && value !== undefined && typeof value !== 'string') {
      continue;
    }

    const bucket = groups.get(base) ?? {};
    bucket[lang as Lang] = value ?? null;
    groups.set(base, bucket);
  }

  return groups;
}

/**
 * Yozish (create/update) uchun teskari amal: `{ uz, ru, en }` DTO obyektini
 * `{ <field>_uz, <field>_ru, <field>_en }` ustunlariga yoyadi.
 *
 * Bo'sh (`undefined`) tillar natijaga tushmaydi - shunda `PATCH` so'rovi
 * yuborilmagan tilni `null` qilib o'chirib yubormaydi.
 */
export function spreadLocalized<F extends string>(
  field: F,
  value: Partial<Record<Lang, string | null>> | undefined,
): Partial<Record<`${F}_${Lang}`, string | null>> {
  if (!value) return {};

  const output: Partial<Record<`${F}_${Lang}`, string | null>> = {};
  for (const lang of SUPPORTED_LANGUAGES) {
    const text = value[lang];
    if (text === undefined) continue;
    output[`${field}_${lang}`] = text;
  }

  return output;
}

/**
 * `spreadLocalized` ning majburiy maydonlar uchun varianti: uchala til ham
 * to'ldiriladi, bo'sh qolganlari mavjud tildan nusxalanadi.
 *
 * Admin panel bitta tilni to'ldirib yuborishi mumkin - mahsulot boshqa tilda
 * umuman nomsiz qolib ketmasligi uchun.
 */
export function spreadLocalizedRequired<F extends string>(
  field: F,
  value: Partial<Record<Lang, string | null>>,
): Record<`${F}_${Lang}`, string> {
  const output = {} as Record<`${F}_${Lang}`, string>;

  for (const lang of SUPPORTED_LANGUAGES) {
    output[`${field}_${lang}`] = pickLocalized(value, lang) ?? '';
  }

  return output;
}
