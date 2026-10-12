/**
 * Barcha narxlar O'ZBEK SO'MIDA, butun son sifatida saqlanadi va qaytariladi.
 *
 * So'mda amalda tiyin ishlatilmaydi, `1 250 000.5` kabi kasr qiymat esa
 * savat/buyurtma yig'indisida suzuvchi nuqta xatosini to'playdi va Payme chek
 * summasi (`Σ price × count == amount`) bilan tafovut beradi. Payme bilan
 * almashinuvda so'm tiyinga (x100) faqat `toTiyin` da o'giriladi.
 */
export const CURRENCY = 'UZS' as const;

/** Summani butun so'mga yaxlitlaydi. */
export function roundSom(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}
