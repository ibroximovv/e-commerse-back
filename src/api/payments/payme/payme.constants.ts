import { PaymeState } from '@prisma/client';

/**
 * Payme Merchant API protokoli.
 * Hujjat: https://developer.help.paycom.uz/metody-merchant-api/
 *
 * Test muhiti: https://test.paycom.uz
 */

export const PAYME_METHODS = [
  'CheckPerformTransaction',
  'CreateTransaction',
  'PerformTransaction',
  'CancelTransaction',
  'CheckTransaction',
  'GetStatement',
] as const;

export type PaymeMethod = (typeof PAYME_METHODS)[number];

/**
 * Protokolda qat'iy belgilangan xato kodlari - o'zgartirib bo'lmaydi.
 * -31050..-31099 oralig'i "merchant o'zi belgilaydigan" xatolar uchun ajratilgan.
 */
export const PaymeErrorCode = {
  /** JSON-RPC so'rovini o'qib bo'lmadi. */
  PARSE_ERROR: -32700,
  /** So'rov formati noto'g'ri. */
  INVALID_REQUEST: -32600,
  /** Bunday metod yo'q. */
  METHOD_NOT_FOUND: -32601,
  /** Avtorizatsiya kaliti noto'g'ri. */
  INSUFFICIENT_PRIVILEGES: -32504,

  /** Summa buyurtma summasiga mos kelmadi. */
  INVALID_AMOUNT: -31001,
  /** Tranzaksiya topilmadi. */
  TRANSACTION_NOT_FOUND: -31003,
  /** Bekor qilib bo'lmaydi (buyurtma yetkazib berilgan). */
  CANNOT_CANCEL: -31007,
  /** Amalni bajarib bo'lmaydi (holat mos emas yoki vaqt o'tgan). */
  CANNOT_PERFORM: -31008,

  /** Buyurtma topilmadi yoki to'lovga yaroqsiz. */
  ORDER_NOT_FOUND: -31050,
  /** Buyurtma allaqachon boshqa tranzaksiyada band. */
  ORDER_IN_PROGRESS: -31051,
  /** Buyurtma allaqachon to'langan - ikkinchi marta to'lab bo'lmaydi. */
  ORDER_ALREADY_PAID: -31052,
} as const;

/** Payme `state` raqamlari. Bazadagi enum shu qiymatlarga moslanadi. */
export const PAYME_STATE_CODES: Record<PaymeState, number> = {
  [PaymeState.CREATED]: 1,
  [PaymeState.PERFORMED]: 2,
  [PaymeState.CANCELLED]: -1,
  [PaymeState.CANCELLED_AFTER_PERFORM]: -2,
};

/**
 * Payme yaratilgan tranzaksiyani 12 soat ichida yakunlashi kerak.
 * Kechikkan `CreateTransaction` rad etiladi (-31008).
 */
export const PAYME_TRANSACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/**
 * Protokolda 4 - "tranzaksiya muddati tugadi". Vaqti o'tgan tranzaksiyani
 * o'zimiz bekor qilganda `reason` shu qiymat bilan yoziladi.
 */
export const PAYME_TIMEOUT_CANCEL_REASON = 4;

/** So'mni tiyinga o'giradi - Payme barcha summalarni tiyinda yuboradi. */
export function toTiyin(amountInSom: number): number {
  return Math.round(amountInSom * 100);
}

/** Tiyinni so'mga qaytaradi. */
export function toSom(amountInTiyin: number): number {
  return Math.round(amountInTiyin) / 100;
}

/** `buildPaymeCheckoutUrl` uchun kirish qiymatlari. */
export interface PaymeCheckoutLinkParams {
  /** Kabinetdagi kassa identifikatori (`PAYME_MERCHANT_ID`). */
  merchantId: string;
  /** Kabinetdagi `account` maydonining nomi, odatda `order_id`. */
  accountField: string;
  orderId: string;
  /** So'mda - funksiya o'zi tiyinga o'giradi. */
  amountInSom: number;
  /** Kassa oynasining tili: `uz` | `ru` | `en`. */
  lang: string;
  /** `https://test.paycom.uz` yoki `https://checkout.paycom.uz`. */
  checkoutUrl: string;
  /** To'lovdan keyin qaytish sahifasi (`c=`). Bo'sh bo'lsa qo'shilmaydi. */
  returnUrl?: string;
}

/**
 * Payme kassasiga havola quradi.
 *
 * Toza funksiya - Nest DI'siz ham chaqiriladi: `scripts/payme-test-order.ts`
 * manager uchun test buyurtmasi yaratganda aynan shu havolani chiqaradi.
 * Agar skript formatni o'zi takrorlaganda, serverdagi havola bilan
 * bir kun ajralib ketardi va test boshqa narsani tekshirgan bo'lardi.
 */
export function buildPaymeCheckoutUrl({
  merchantId,
  accountField,
  orderId,
  amountInSom,
  lang,
  checkoutUrl,
  returnUrl,
}: PaymeCheckoutLinkParams): string {
  const parts = [
    `m=${merchantId}`,
    `ac.${accountField}=${orderId}`,
    `a=${toTiyin(amountInSom)}`,
    `l=${lang}`,
    'cr=UZS',
  ];

  if (returnUrl) parts.push(`c=${returnUrl}`);

  const encoded = Buffer.from(parts.join(';'), 'utf-8').toString('base64');
  return `${checkoutUrl.replace(/\/+$/, '')}/${encoded}`;
}
