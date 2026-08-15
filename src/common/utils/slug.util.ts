/**
 * Kirill (ru/uz) va o'zbek lotin harflarini URL uchun xavfsiz ASCII ga o'giradi.
 * Masalan: "Смартфоны" -> "smartfony", "O'yinchoqlar" -> "oyinchoqlar"
 */
const TRANSLITERATION_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ғ: 'g',
  қ: 'q',
  ҳ: 'h',
  ў: 'o',
  // O'zbek lotin apostroflari
  ʻ: '',
  ʼ: '',
  '‘': '',
  '’': '',
  "'": '',
  '`': '',
};

export function slugify(value: string): string {
  if (!value) return '';

  const lowered = value.toString().trim().toLowerCase();

  let result = '';
  for (const char of lowered) {
    result +=
      TRANSLITERATION_MAP[char] !== undefined
        ? TRANSLITERATION_MAP[char]
        : char;
  }

  return result
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diakritik belgilarni olib tashlash
    .replace(/[^a-z0-9]+/g, '-') // harf/raqamdan boshqasi -> defis
    .replace(/^-+|-+$/g, '') // chetdagi defislar
    .replace(/-{2,}/g, '-'); // ketma-ket defislar
}

/**
 * Bazada band bo'lmagan slug qaytaradi. Band bo'lsa `-2`, `-3` ... qo'shadi.
 * `isTaken` - slug band ekanligini tekshiruvchi funksiya.
 */
export async function generateUniqueSlug(
  source: string,
  isTaken: (slug: string) => Promise<boolean>,
  fallbackPrefix = 'item',
): Promise<string> {
  const base = slugify(source) || fallbackPrefix;
  let candidate = base;
  let suffix = 2;

  while (await isTaken(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
    // Cheksiz sikldan himoya
    if (suffix > 500) {
      candidate = `${base}-${Date.now()}`;
      break;
    }
  }

  return candidate;
}
