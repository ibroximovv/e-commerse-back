/**
 * Telefon raqamini yagona E.164 ko'rinishiga keltiradi: `+998901234567`.
 *
 * Foydalanuvchi raqamni turlicha yozadi (`90 123 45 67`, `+998 (90) 123-45-67`,
 * `998901234567`). Bazada bitta shakl saqlanmasa, bir odam ikki marta ro'yxatdan
 * o'tib qolardi va login raqamni topa olmasdi.
 *
 *  - 9 ta raqam (operator kodi bilan, `+998` siz) -> `+998` qo'shiladi;
 *  - 10-15 ta raqam -> boshiga `+` qo'yiladi (xorijiy raqamlar ham o'tadi).
 *
 * Yaroqsiz bo'lsa `null` qaytaradi.
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  let digits = input.replace(/\D/g, '');
  if (digits.length === 9) digits = `998${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;

  return `+${digits}`;
}

/** Ismni saqlash uchun: chetdagi va ortiqcha bo'shliqlar olib tashlanadi. */
export function cleanFullName(input: unknown): string {
  return typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Loginda ismni solishtirish uchun kalit: bo'shliqlar va registr farqi hisobga
 * olinmaydi (`aziza  KARIMOVA` == `Aziza Karimova`).
 */
export function fullNameKey(input: unknown): string {
  return cleanFullName(input).toLocaleLowerCase();
}
