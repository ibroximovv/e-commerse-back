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

/**
 * Fiskal maydonlar to'plami. Mahsulotda ham, kategoriyada ham bir xil.
 */
export interface ReceiptFiscalFields {
  ikpu_code: string | null;
  package_code: string | null;
  vat_percent: number | null;
  units: number | null;
}

/** Mahsulotdan chek qatori uchun kerak bo'ladigan minimal ma'lumot. */
export interface ReceiptProduct extends ReceiptFiscalFields {
  name_uz: string;
  name_ru: string;
  name_en: string;
  /**
   * Mahsulotdagi maydon bo'sh bo'lsa shu yerdan olinadi.
   *
   * IKPU tovar guruhiga beriladi, shuning uchun normal holatda faqat
   * kategoriya to'ldiriladi; mahsulot darajasi bir kategoriyada turli
   * guruhdagi tovarlar bo'lganda (payvandlash apparati va elektrodvigatel)
   * kerak bo'ladi.
   */
  category: ReceiptFiscalFields | null;
}

export interface ReceiptLine {
  product: ReceiptProduct;
  quantity: number;
  /** Bitta dona narxi, SO'MDA. */
  unit_price: number;
}

/** Mahsulot -> kategoriya tartibida birinchi to'ldirilgan matnni oladi. */
function resolveText(
  product: ReceiptFiscalFields,
  category: ReceiptFiscalFields | null,
  field: 'ikpu_code' | 'package_code',
): string {
  return product[field]?.trim() || category?.[field]?.trim() || '';
}

/**
 * Mahsulot -> kategoriya tartibida birinchi berilgan sonni oladi.
 *
 * `??` ataylab: `vat_percent: 0` haqiqiy qiymat (QQS to'lovchisi emas), uni
 * `||` bilan olsak kategoriyaga tushib ketardi.
 */
function resolveNumber(
  product: ReceiptFiscalFields,
  category: ReceiptFiscalFields | null,
  field: 'vat_percent' | 'units',
): number | null {
  return product[field] ?? category?.[field] ?? null;
}

/**
 * Buyurtma qatorlaridan fiskal chekni quradi.
 *
 * Chek `title` i mijoz tanlagan tilda beriladi - foydalanuvchi Payme
 * kassasida o'zi ko'rgan nomni ko'rishi kerak.
 */
export function buildReceiptDetail(
  lines: ReceiptLine[],
  lang: Lang,
): PaymeReceiptDetail {
  return {
    receipt_type: 0,
    items: lines.map((line) => {
      const { product } = line;
      const { category } = product;

      const title =
        pickLocalized(
          {
            uz: product.name_uz,
            ru: product.name_ru,
            en: product.name_en,
          },
          lang,
        ) ?? '';

      // `code` va `vat_percent` - Payme uchun MAJBURIY. Bo'sh yuborsak chek
      // to'lov paytida rad etilardi va sabab noaniq bo'lardi, shuning uchun
      // aniq xato bilan darrov to'xtaymiz.
      const code = resolveText(product, category, 'ikpu_code');
      if (!code) throw new MissingFiscalDataError(title, 'ikpu_code');

      const vatPercent = resolveNumber(product, category, 'vat_percent');
      if (vatPercent === null) {
        throw new MissingFiscalDataError(title, 'vat_percent');
      }

      const packageCode = resolveText(product, category, 'package_code');
      const units = resolveNumber(product, category, 'units');

      return {
        title,
        price: toTiyin(line.unit_price),
        count: line.quantity,
        code,
        vat_percent: vatPercent,
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

/** Mahsulotda ham, uning kategoriyasida ham majburiy maydon topilmadi. */
export class MissingFiscalDataError extends Error {
  constructor(
    readonly productTitle: string,
    readonly field: 'ikpu_code' | 'vat_percent',
  ) {
    super(
      `"${productTitle}" uchun ${field} topilmadi. Mahsulotning KATEGORIYASIGA ` +
        `${field} qo'ying (bir kategoriyadagi hamma mahsulot uni oladi), ` +
        "yoki shu mahsulotning o'ziga alohida qiymat bering.",
    );
    this.name = 'MissingFiscalDataError';
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
