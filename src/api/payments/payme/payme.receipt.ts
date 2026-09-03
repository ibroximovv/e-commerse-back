import { Lang, pickLocalized } from '../../../common/i18n/locale';
import { toTiyin } from './payme.constants';

/**
 * Fiskal chek (O'zbekiston OFD) qatorlari.
 *
 * Payme `CheckPerformTransaction` javobida `result.detail` ni kutadi va uni
 * soliq organiga chek sifatida uzatadi. Har bir qator uchun MXIK/IKPU kodi
 * (`code`), qadoqlash kodi va QQS stavkasi majburiy - ularsiz Payme kassasi
 * chekni fiskallashtira olmaydi.
 *
 * Barcha summalar TIYINDA.
 */
export interface PaymeReceiptItem {
  title: string;
  price: number;
  count: number;
  /** MXIK / IKPU - Payme uchun MAJBURIY, bo'sh bo'lsa chek fiskallashmaydi. */
  code: string;
  /** QQS foizi - MAJBURIY (0 ham to'g'ri qiymat). */
  vat_percent: number;
  package_code?: string;
  /**
   * O'lchov birligi klassifikatori. Ixtiyoriy - sozlanmagan bo'lsa umuman
   * yuborilmaydi. `units: 0` yuborish xato bo'lardi: 0 mavjud bo'lmagan kod.
   */
  units?: number;
  discount: number;
}

export interface PaymeReceiptDetail {
  /**
   * 0 - oddiy sotuv. Payme protokolida boshqa turlari ham bor
   * (qaytarish va h.k.), lekin bu yerda faqat sotuv chekini yuboramiz.
   */
  receipt_type: number;
  items: PaymeReceiptItem[];
}

/** Mahsulotdan chek qatori uchun kerak bo'ladigan minimal ma'lumot. */
export interface ReceiptProduct {
  name_uz: string;
  name_ru: string;
  name_en: string;
  ikpu_code: string | null;
  package_code: string | null;
  vat_percent: number | null;
  units: number | null;
}

export interface ReceiptLine {
  product: ReceiptProduct;
  quantity: number;
  /** Bitta dona narxi, SO'MDA. */
  unit_price: number;
}

/** `.env` dan keladigan zaxira qiymatlar. */
export interface ReceiptDefaults {
  ikpuCode: string;
  packageCode: string;
  vatPercent: number;
  units: number;
}

/**
 * Buyurtma qatorlaridan fiskal chekni quradi.
 *
 * Chek `title` i mijoz tanlagan tilda beriladi - foydalanuvchi Payme
 * kassasida o'zi ko'rgan nomni ko'rishi kerak.
 */
export function buildReceiptDetail(
  lines: ReceiptLine[],
  defaults: ReceiptDefaults,
  lang: Lang,
): PaymeReceiptDetail {
  return {
    receipt_type: 0,
    items: lines.map((line) => {
      const title =
        pickLocalized(
          {
            uz: line.product.name_uz,
            ru: line.product.name_ru,
            en: line.product.name_en,
          },
          lang,
        ) ?? '';

      const code = line.product.ikpu_code?.trim() || defaults.ikpuCode;
      if (!code) {
        // Bo'sh IKPU bilan yuborsak Payme chekni to'lov paytida rad etardi va
        // sabab noaniq bo'lardi. Aniq xato bilan darrov to'xtaymiz.
        throw new MissingIkpuError(title);
      }

      const packageCode =
        line.product.package_code?.trim() || defaults.packageCode;
      const units = line.product.units ?? defaults.units;

      return {
        title,
        price: toTiyin(line.unit_price),
        count: line.quantity,
        code,
        vat_percent: line.product.vat_percent ?? defaults.vatPercent,
        // Sozlanmagan ixtiyoriy maydonlarni umuman yubormaymiz:
        // `package_code: ""` yoki `units: 0` - mavjud bo'lmagan kodlar
        ...(packageCode ? { package_code: packageCode } : {}),
        ...(units ? { units } : {}),
        // Chegirma mahsulot narxining o'ziga singdirilgan (`price_at_purchase`
        // allaqachon yakuniy narx), shuning uchun alohida qator chegirmasi yo'q.
        discount: 0,
      };
    }),
  };
}

/** Mahsulotda ham, `.env` da ham IKPU topilmadi. */
export class MissingIkpuError extends Error {
  constructor(readonly productTitle: string) {
    super(
      `"${productTitle}" uchun IKPU kodi topilmadi. Mahsulotga ikpu_code ` +
        "qo'ying yoki PAYME_DEFAULT_IKPU_CODE ni sozlang.",
    );
    this.name = 'MissingIkpuError';
  }
}

/**
 * Chek qatorlari yig'indisi to'lov summasiga tengmi.
 *
 * Payme yig'indi mos kelmasa chekni rad etadi, shuning uchun buni
 * `CheckPerformTransaction` da OLDINDAN tekshiramiz - aks holda xato
 * `PerformTransaction` bosqichida, ya'ni pul yechilgandan keyin chiqardi.
 */
export function receiptTotal(detail: PaymeReceiptDetail): number {
  return detail.items.reduce(
    (sum, item) => sum + item.price * item.count - item.discount,
    0,
  );
}
