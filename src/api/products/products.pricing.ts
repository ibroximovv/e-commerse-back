/**
 * Mahsulotning hosila (derived) maydonlarini bir joyda hisoblaydi.
 *
 * `final_price`, `discount_percent` va `popularity_score` bazada saqlanadi, chunki
 * MongoDB/Prisma hisoblangan ifoda bo'yicha filtr va sortlashni qo'llab-quvvatlamaydi.
 * Shu sabab ular mahsulot yozilgan har safar qayta hisoblanadi.
 */

/**
 * Og'irliklar ataylab butun son: `popularity_score` bazada `increment` orqali
 * o'sadi, kasrli qadam (masalan 0.1) minglab ko'rishdan keyin suzuvchi nuqta
 * xatosini to'plab qo'yardi. Nisbat esa o'zgarmaydi: 1 sotuv = 100 ko'rish.
 */
export const POPULARITY_WEIGHTS = {
  sale: 100, // bitta sotilgan dona
  rating: 20, // reyting * baholovchilar soni
  view: 1, // bitta ko'rish
} as const;

export interface PriceFields {
  final_price: number;
  discount_percent: number;
}

export function computePriceFields(
  price: number,
  discountPrice?: number | null,
): PriceFields {
  const hasDiscount =
    discountPrice !== null &&
    discountPrice !== undefined &&
    discountPrice >= 0 &&
    discountPrice < price;

  const finalPrice = hasDiscount ? discountPrice : price;
  const discountPercent =
    hasDiscount && price > 0
      ? Math.round(((price - finalPrice) / price) * 100)
      : 0;

  return {
    final_price: round2(finalPrice),
    discount_percent: discountPercent,
  };
}

export function computePopularityScore(input: {
  sales_count: number;
  rating: number;
  rating_count: number;
  view_count: number;
}): number {
  const score =
    input.sales_count * POPULARITY_WEIGHTS.sale +
    input.rating * input.rating_count * POPULARITY_WEIGHTS.rating +
    input.view_count * POPULARITY_WEIGHTS.view;

  return round2(score);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
