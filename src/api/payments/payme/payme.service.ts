import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  PaymeState,
  PaymeTransaction,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import {
  DEFAULT_LANGUAGE,
  Lang,
  normalizeLanguage,
} from '../../../common/i18n/locale';
import { POPULARITY_WEIGHTS } from '../../products/products.pricing';
import {
  PAYME_STATE_CODES,
  PAYME_TIMEOUT_CANCEL_REASON,
  PAYME_TRANSACTION_TIMEOUT_MS,
  PaymeMethod,
  buildPaymeCheckoutUrl,
  toSom,
  toTiyin,
} from './payme.constants';
import {
  MissingFiscalDataError,
  buildReceiptDetail,
  receiptTotal,
} from './payme.receipt';
import { PaymeError } from './payme.error';
import {
  PaymeAccount,
  PaymeRequest,
  PaymeTransactionView,
} from './payme.types';

/**
 * Payme Merchant API (JSON-RPC) implementatsiyasi.
 *
 * Payme SERVERI bizga murojaat qiladi, biz Payme'ga emas. Oqim:
 *
 *   1. Mijoz `GET /api/payments/checkout/:order_id` orqali to'lov havolasini oladi;
 *   2. Payme kassasida karta ma'lumotlarini kiritadi;
 *   3. Payme bizning `POST /api/payments/payme` endpointimizga
 *      CheckPerformTransaction -> CreateTransaction -> PerformTransaction
 *      ketma-ketligini yuboradi.
 *
 * Har bir metod IDEMPOTENT: Payme tarmoq xatosida so'rovni qayta yuboradi va
 * ikkinchi urinish birinchisi bilan bir xil natija qaytarishi shart.
 */
@Injectable()
export class PaymeService implements OnModuleInit {
  private readonly logger = new Logger(PaymeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Sozlamalarni ishga tushishda tekshiramiz.
   *
   * Aks holda yetishmayotgan kalit yoki IKPU faqat haqiqiy mijoz to'lov
   * qilmoqchi bo'lganda bilinardi - ya'ni eng yomon paytda.
   */
  async onModuleInit() {
    const missing = [
      ['PAYME_MERCHANT_ID', this.merchantId],
      ['PAYME_KEY', this.config.get<string>('PAYME_KEY')],
    ].filter(([, value]) => !value);

    if (missing.length) {
      this.logger.warn(
        `Payme to'liq sozlanmagan: ${missing.map(([key]) => key).join(', ')}. ` +
          "To'lov ishlamaydi.",
      );
    }

    await this.warnAboutMissingFiscalData();

    if (this.checkoutUrl.includes('test.paycom.uz')) {
      this.logger.warn(
        "Payme TEST kassasi ishlatilmoqda (test.paycom.uz) - haqiqiy pul o'tmaydi.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Konfiguratsiya
  // ---------------------------------------------------------------------------

  /** Merchant kabinetidagi `account` maydonining nomi (odatda `order_id`). */
  private get accountField(): string {
    return this.config.get<string>('PAYME_ACCOUNT_FIELD') ?? 'order_id';
  }

  private get merchantId(): string {
    return this.config.get<string>('PAYME_MERCHANT_ID') ?? '';
  }

  /**
   * Kassa (checkout) manzili. Test uchun `https://test.paycom.uz`,
   * ishlab chiqarish uchun `https://checkout.paycom.uz`.
   */
  private get checkoutUrl(): string {
    return (
      this.config.get<string>('PAYME_CHECKOUT_URL') ?? 'https://test.paycom.uz'
    );
  }

  /** To'lovdan keyin mijoz qaytariladigan sahifa (`c=` parametri). */
  private get returnUrl(): string {
    return this.config.get<string>('PAYME_RETURN_URL') ?? '';
  }

  /**
   * Fiskal maydonlari to'ldirilmagan kategoriyalar haqida bootda ogohlantiradi.
   *
   * Ilgari bu tekshiruv `.env` dagi PAYME_DEFAULT_IKPU_CODE ustida edi. Endi
   * ma'lumot bazada, shuning uchun tekshiruv ham bazada. Xato yutiladi: baza
   * hali ko'tarilmagan bo'lsa ilova shu sababdan qulamasligi kerak.
   */
  private async warnAboutMissingFiscalData() {
    try {
      const gaps = await this.prisma.category.findMany({
        where: {
          is_archived: false,
          OR: [{ ikpu_code: null }, { ikpu_code: '' }, { vat_percent: null }],
        },
        select: { name_ru: true, slug: true },
      });

      if (gaps.length) {
        this.logger.warn(
          `Fiskal ma'lumotsiz kategoriya: ${gaps
            .map((c) => c.name_ru || c.slug)
            .join(', ')}. Ulardagi mahsulotlar uchun to'lov -31008 bilan ` +
            "to'xtaydi. Tekshirish: npm run db:check:ikpu",
        );
      }
    } catch {
      // Baza yo'q/tayyor emas - bu tekshiruv ilovani ushlab turmasligi kerak.
    }
  }

  // ---------------------------------------------------------------------------
  // Avtorizatsiya
  // ---------------------------------------------------------------------------

  /**
   * `Authorization: Basic base64("Paycom:<KEY>")` ni tekshiradi.
   *
   * Solishtirish `timingSafeEqual` bilan - oddiy `===` kalitni belgima-belgi
   * taxmin qilish (timing attack) uchun yo'l ochib beradi.
   */
  authorize(header: string | undefined): void {
    const expectedKey = this.config.get<string>('PAYME_KEY');

    if (!expectedKey) {
      this.logger.error("PAYME_KEY sozlanmagan - barcha so'rovlar rad etiladi");
      throw PaymeError.insufficientPrivileges();
    }

    if (!header?.startsWith('Basic ')) {
      throw PaymeError.insufficientPrivileges();
    }

    let decoded: string;
    try {
      decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf-8');
    } catch {
      throw PaymeError.insufficientPrivileges();
    }

    // Kalitning o'zida ham `:` bo'lishi mumkin - faqat birinchisidan bo'lamiz
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) throw PaymeError.insufficientPrivileges();

    const login = decoded.slice(0, separatorIndex);
    const key = decoded.slice(separatorIndex + 1);

    if (login !== 'Paycom' || !safeEqual(key, expectedKey)) {
      throw PaymeError.insufficientPrivileges();
    }
  }

  // ---------------------------------------------------------------------------
  // Dispatcher
  // ---------------------------------------------------------------------------

  async handle(request: PaymeRequest): Promise<unknown> {
    const params = request.params ?? {};

    switch (request.method as PaymeMethod) {
      case 'CheckPerformTransaction':
        return this.checkPerformTransaction(params.account, params.amount);
      case 'CreateTransaction':
        return this.createTransaction(
          params.id,
          params.time,
          params.amount,
          params.account,
        );
      case 'PerformTransaction':
        return this.performTransaction(params.id);
      case 'CancelTransaction':
        return this.cancelTransaction(params.id, params.reason);
      case 'CheckTransaction':
        return this.checkTransaction(params.id);
      case 'GetStatement':
        return this.getStatement(params.from, params.to);
      default:
        throw PaymeError.methodNotFound(request.method);
    }
  }

  // ---------------------------------------------------------------------------
  // Metodlar
  // ---------------------------------------------------------------------------

  /**
   * Buyurtma to'lovga tayyormi - Payme kassa oynasini ochishdan oldin so'raydi.
   *
   * Javobga fiskal chek (`detail`) ham qo'shiladi: O'zbekistonda Payme chekni
   * soliq organiga shu ma'lumotlar bilan uzatadi, ularsiz to'lov fiskallashmaydi.
   */
  private async checkPerformTransaction(
    account: PaymeAccount | undefined,
    amount: number | undefined,
  ) {
    const order = await this.resolveOrder(account);
    this.assertPayable(order);
    this.assertAmountMatches(order.total_amount, amount);

    // Chek nomlari xaridorning o'z tilida: u Payme kassasida saytda ko'rgan
    // nomni ko'rishi kerak. Payme so'rovida til kelmaydi.
    let detail: Awaited<ReturnType<PaymeService['buildOrderReceipt']>>;
    try {
      detail = await this.buildOrderReceipt(
        order.id,
        normalizeLanguage(order.user?.language),
      );
    } catch (error) {
      if (error instanceof MissingFiscalDataError) {
        // Bu bizning konfiguratsiya xatomiz, mijozning aybi emas - lekin
        // Payme'ga protokol xatosidan boshqa narsa qaytara olmaymiz
        this.logger.error(error.message);
        throw PaymeError.cannotPerform('fiscal data is not configured');
      }
      throw error;
    }

    // Chek yig'indisi to'lov summasidan farq qilsa Payme uni rad etadi.
    // Buni hozir ushlaymiz - keyinroq bo'lsa pul yechilgandan keyin chiqardi.
    const total = receiptTotal(detail);
    if (total !== toTiyin(order.total_amount)) {
      this.logger.error(
        `Buyurtma ${order.id}: chek yig'indisi (${total}) buyurtma summasiga ` +
          `(${toTiyin(order.total_amount)}) mos kelmadi`,
      );
      throw PaymeError.invalidAmount();
    }

    return { allow: true, detail };
  }

  /** Buyurtma qatorlaridan fiskal chek quradi. */
  private async buildOrderReceipt(orderId: string, lang: Lang) {
    const items = await this.prisma.orderItem.findMany({
      where: { order_id: orderId },
      include: {
        product: {
          select: {
            name_uz: true,
            name_ru: true,
            name_en: true,
            ikpu_code: true,
            package_code: true,
            vat_percent: true,
            units: true,
            // Odatda fiskal maydonlar SHU YERDA to'ldirilgan bo'ladi:
            // IKPU tovar guruhiga beriladi, mahsulotdagi qiymat esa faqat
            // kategoriya ichidagi istisnolar uchun.
            category: {
              select: {
                ikpu_code: true,
                package_code: true,
                vat_percent: true,
                units: true,
              },
            },
          },
        },
      },
    });

    return buildReceiptDetail(
      items.map((item) => ({
        product: item.product,
        quantity: item.quantity,
        unit_price: item.price_at_purchase,
      })),
      lang,
    );
  }

  /**
   * Tranzaksiya yaratadi (yoki mavjudini qaytaradi).
   *
   * Idempotentlik: bir xil `id` bilan takroriy so'rov kelsa yangi yozuv
   * yaratilmaydi - birinchisining `create_time` va `state` qiymatlari qaytadi.
   */
  private async createTransaction(
    transactionId: string | undefined,
    time: number | undefined,
    amount: number | undefined,
    account: PaymeAccount | undefined,
  ) {
    if (!transactionId) throw PaymeError.invalidRequest('id');
    if (typeof time !== 'number') throw PaymeError.invalidRequest('time');

    const existing = await this.findTransaction(transactionId);

    if (existing) {
      // Takroriy so'rov: faqat hali kutayotgan tranzaksiyani tasdiqlaymiz
      if (existing.state !== PaymeState.CREATED) {
        throw PaymeError.cannotPerform('transaction is not in created state');
      }
      if (this.isExpired(existing.create_time)) {
        await this.markCancelled(
          existing,
          PaymeState.CANCELLED,
          PAYME_TIMEOUT_CANCEL_REASON,
        );
        throw PaymeError.cannotPerform('transaction timed out');
      }

      return this.createdView(existing);
    }

    const order = await this.resolveOrder(account);
    this.assertPayable(order);
    this.assertAmountMatches(order.total_amount, amount);

    // Payme 12 soatdan eski tranzaksiyani yaratishga ruxsat bermaydi
    if (Date.now() - time > PAYME_TRANSACTION_TIMEOUT_MS) {
      throw PaymeError.cannotPerform('transaction timed out');
    }

    await this.assertNoActiveTransaction(order.id);

    const now = Date.now();
    const amountInSom = toSom(amount as number);

    // Jurnalga YANGI yozuv qo'shiladi, `Payment` esa shu oxirgi urinishning
    // nusxasini saqlaydi - admin panel to'lov holatini bitta so'rovda ko'radi.
    const mirror = {
      amount: amountInSom,
      provider: 'payme',
      status: PaymentStatus.PENDING,
      payme_transaction_id: transactionId,
      payme_state: PaymeState.CREATED,
      payme_time: time,
      payme_create_time: now,
      payme_perform_time: null,
      payme_cancel_time: null,
      payme_reason: null,
      error_message: null,
    };

    const [transaction] = await this.prisma.$transaction([
      this.prisma.paymeTransaction.create({
        data: {
          transaction_id: transactionId,
          order_id: order.id,
          amount: amountInSom,
          state: PaymeState.CREATED,
          time,
          create_time: now,
        },
      }),
      this.prisma.payment.upsert({
        where: { order_id: order.id },
        create: { ...mirror, order_id: order.id },
        update: mirror,
      }),
    ]);

    return this.createdView(transaction);
  }

  /**
   * Buyurtmada ayni damda ochiq tranzaksiya bo'lmasligini tekshiradi.
   *
   * Payme bitta hisob uchun ikkita parallel tranzaksiyani taqiqlaydi: aks
   * holda mijozdan ikki marta pul yechilishi mumkin.
   */
  private async assertNoActiveTransaction(orderId: string) {
    const active = await this.prisma.paymeTransaction.findFirst({
      where: {
        order_id: orderId,
        state: { in: [PaymeState.CREATED, PaymeState.PERFORMED] },
      },
      orderBy: { create_time: 'desc' },
    });

    if (!active) return;

    if (active.state === PaymeState.PERFORMED) {
      throw PaymeError.orderAlreadyPaid(this.accountField);
    }

    // Muddati o'tgan tranzaksiya buyurtmani abadiy band qilib turmasligi
    // kerak - uni yopamiz va yangisiga yo'l beramiz
    if (this.isExpired(active.create_time)) {
      await this.markCancelled(
        active,
        PaymeState.CANCELLED,
        PAYME_TIMEOUT_CANCEL_REASON,
      );
      return;
    }

    throw PaymeError.orderInProgress(this.accountField);
  }

  /** To'lovni yakunlaydi: buyurtma CONFIRMED bo'ladi. */
  private async performTransaction(transactionId: string | undefined) {
    const transaction = await this.requireTransaction(transactionId);

    // Allaqachon bajarilgan - o'sha natijani qaytaramiz (idempotentlik)
    if (transaction.state === PaymeState.PERFORMED) {
      return {
        transaction: transaction.id,
        perform_time: transaction.perform_time ?? 0,
        state: PAYME_STATE_CODES[PaymeState.PERFORMED],
      };
    }

    if (transaction.state !== PaymeState.CREATED) {
      throw PaymeError.cannotPerform('transaction is cancelled');
    }

    if (this.isExpired(transaction.create_time)) {
      await this.markCancelled(
        transaction,
        PaymeState.CANCELLED,
        PAYME_TIMEOUT_CANCEL_REASON,
      );
      throw PaymeError.cannotPerform('transaction timed out');
    }

    const performTime = Date.now();

    // Jurnal, to'lov nusxasi va buyurtma holati birga o'zgaradi - pul o'tib,
    // buyurtma esa PENDING bo'lib qolgan holat yuzaga kelmasligi uchun
    await this.prisma.$transaction([
      this.prisma.paymeTransaction.update({
        where: { id: transaction.id },
        data: { state: PaymeState.PERFORMED, perform_time: performTime },
      }),
      this.prisma.payment.updateMany({
        where: {
          order_id: transaction.order_id,
          payme_transaction_id: transaction.transaction_id,
        },
        data: {
          status: PaymentStatus.SUCCESSFUL,
          payme_state: PaymeState.PERFORMED,
          payme_perform_time: performTime,
        },
      }),
      this.prisma.order.update({
        where: { id: transaction.order_id },
        data: { status: OrderStatus.CONFIRMED },
      }),
    ]);

    return {
      transaction: transaction.id,
      perform_time: performTime,
      state: PAYME_STATE_CODES[PaymeState.PERFORMED],
    };
  }

  /**
   * Tranzaksiyani bekor qiladi.
   *
   * To'langan buyurtmani bekor qilish (qaytarish) faqat u hali yetkazilmagan
   * bo'lsa mumkin - aks holda -31007.
   */
  private async cancelTransaction(
    transactionId: string | undefined,
    reason: number | undefined,
  ) {
    const transaction = await this.requireTransaction(transactionId);

    // Allaqachon bekor qilingan - o'sha natijani qaytaramiz (idempotentlik)
    if (
      transaction.state === PaymeState.CANCELLED ||
      transaction.state === PaymeState.CANCELLED_AFTER_PERFORM
    ) {
      return {
        transaction: transaction.id,
        cancel_time: transaction.cancel_time ?? 0,
        state: PAYME_STATE_CODES[transaction.state],
      };
    }

    const wasPerformed = transaction.state === PaymeState.PERFORMED;

    if (wasPerformed) {
      const order = await this.prisma.order.findUnique({
        where: { id: transaction.order_id },
        select: { status: true },
      });

      if (order?.status === OrderStatus.DELIVERED) {
        throw PaymeError.cannotCancel();
      }
    }

    const nextState = wasPerformed
      ? PaymeState.CANCELLED_AFTER_PERFORM
      : PaymeState.CANCELLED;

    const updated = await this.markCancelled(
      transaction,
      nextState,
      reason ?? null,
    );

    return {
      transaction: updated.id,
      cancel_time: updated.cancel_time ?? 0,
      state: PAYME_STATE_CODES[nextState],
    };
  }

  /** Tranzaksiya holatini qaytaradi. */
  private async checkTransaction(transactionId: string | undefined) {
    const transaction = await this.requireTransaction(transactionId);

    return {
      create_time: transaction.create_time,
      perform_time: transaction.perform_time ?? 0,
      cancel_time: transaction.cancel_time ?? 0,
      transaction: transaction.id,
      state: PAYME_STATE_CODES[transaction.state],
      reason: transaction.reason ?? null,
    };
  }

  /** Payme solishtirish (sverka) uchun davr bo'yicha tranzaksiyalarni so'raydi. */
  private async getStatement(from: number | undefined, to: number | undefined) {
    if (typeof from !== 'number' || typeof to !== 'number') {
      throw PaymeError.invalidRequest('from/to');
    }

    // Bekor qilinganlari ham kiradi: sverkada Payme har bir urinishni ko'radi
    const records = await this.prisma.paymeTransaction.findMany({
      where: { create_time: { gte: from, lte: to } },
      orderBy: { create_time: 'asc' },
    });

    const transactions: PaymeTransactionView[] = records.map((record) => ({
      id: record.transaction_id,
      time: record.time,
      amount: toTiyin(record.amount),
      account: { [this.accountField]: record.order_id },
      create_time: record.create_time,
      perform_time: record.perform_time ?? 0,
      cancel_time: record.cancel_time ?? 0,
      transaction: record.id,
      state: PAYME_STATE_CODES[record.state],
      reason: record.reason ?? null,
    }));

    return { transactions };
  }

  // ---------------------------------------------------------------------------
  // Kassa havolasi
  // ---------------------------------------------------------------------------

  /**
   * Payme kassasiga yo'naltirish havolasini quradi.
   *
   * Format: `<checkout>/<base64("m=..;ac.<field>=..;a=<tiyin>;l=..;cr=UZS;c=..")>`
   * `c=` - to'lovdan keyin mijoz qaytariladigan sahifa, `.env` da sozlanadi.
   */
  buildCheckoutUrl(
    orderId: string,
    amountInSom: number,
    lang: Lang = DEFAULT_LANGUAGE,
  ): string {
    return buildPaymeCheckoutUrl({
      merchantId: this.merchantId,
      accountField: this.accountField,
      orderId,
      amountInSom,
      lang,
      checkoutUrl: this.checkoutUrl,
      returnUrl: this.returnUrl,
    });
  }

  // ---------------------------------------------------------------------------
  // Ichki yordamchilar
  // ---------------------------------------------------------------------------

  /**
   * `account` dan buyurtmani topadi.
   *
   * Har qanday nosozlik (maydon yo'q, ID noto'g'ri, buyurtma bekor qilingan)
   * bitta xatoga - "buyurtma topilmadi" ga olib keladi: aks holda javob
   * farqiga qarab begona buyurtma ID'larini taxmin qilish mumkin bo'lardi.
   */
  private async resolveOrder(account: PaymeAccount | undefined) {
    const orderId = account?.[this.accountField];

    if (!orderId || typeof orderId !== 'string') {
      throw PaymeError.orderNotFound(this.accountField);
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        total_amount: true,
        status: true,
        user: { select: { language: true } },
      },
    });

    if (!order || order.status === OrderStatus.CANCELLED) {
      throw PaymeError.orderNotFound(this.accountField);
    }

    return order;
  }

  /**
   * Buyurtma hali to'lanmaganmi.
   *
   * `PENDING` dan boshqa har qanday holat (CONFIRMED, SHIPPED, DELIVERED)
   * to'lov allaqachon o'tganini bildiradi. Busiz mijozdan ikkinchi marta pul
   * yechilishi mumkin edi: `CheckPerformTransaction` `allow: true` qaytarib,
   * kassa oynasi ochilaverardi.
   */
  private assertPayable(order: { status: OrderStatus }) {
    if (order.status !== OrderStatus.PENDING) {
      throw PaymeError.orderAlreadyPaid(this.accountField);
    }
  }

  private assertAmountMatches(
    orderTotalInSom: number,
    amountInTiyin: number | undefined,
  ) {
    if (typeof amountInTiyin !== 'number') throw PaymeError.invalidAmount();
    if (toTiyin(orderTotalInSom) !== Math.round(amountInTiyin)) {
      throw PaymeError.invalidAmount();
    }
  }

  private async findTransaction(transactionId: string) {
    return this.prisma.paymeTransaction.findUnique({
      where: { transaction_id: transactionId },
    });
  }

  private async requireTransaction(transactionId: string | undefined) {
    if (!transactionId) throw PaymeError.invalidRequest('id');

    const transaction = await this.findTransaction(transactionId);
    if (!transaction) throw PaymeError.transactionNotFound();

    return transaction;
  }

  /** Yaratilganiga 12 soatdan ko'p bo'lgan tranzaksiya yaroqsiz. */
  private isExpired(createTime: number | null): boolean {
    if (createTime === null) return false;
    return Date.now() - createTime > PAYME_TRANSACTION_TIMEOUT_MS;
  }

  private async markCancelled(
    transaction: PaymeTransaction,
    state: PaymeState,
    reason: number | null,
  ) {
    const cancelTime = Date.now();
    const refunded = state === PaymeState.CANCELLED_AFTER_PERFORM;

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.paymeTransaction.update({
        where: { id: transaction.id },
        data: { state, cancel_time: cancelTime, reason },
      }),
      // Nusxa faqat SHU tranzaksiyaga tegishli bo'lsa yangilanadi: mijoz
      // qaytadan urinib yangi tranzaksiya ochgan bo'lsa, eskisining bekor
      // qilinishi yangisining holatini buzib yubormasligi kerak
      this.prisma.payment.updateMany({
        where: {
          order_id: transaction.order_id,
          payme_transaction_id: transaction.transaction_id,
        },
        data: {
          status: refunded ? PaymentStatus.REFUNDED : PaymentStatus.FAILED,
          payme_state: state,
          payme_cancel_time: cancelTime,
          payme_reason: reason,
        },
      }),
    ];

    // To'langan buyurtma qaytarilsa - buyurtma bekor qilinadi va zaxira
    // omborga qaytariladi. `OrdersService` bekor qilishda ham shunday qiladi;
    // busiz Payme orqali qaytarilgan tovar hisobdan yo'qolib qolardi.
    if (refunded) {
      const items = await this.prisma.orderItem.findMany({
        where: { order_id: transaction.order_id },
        select: { product_id: true, quantity: true },
      });

      for (const item of items) {
        operations.push(
          this.prisma.product.update({
            where: { id: item.product_id },
            data: {
              stock: { increment: item.quantity },
              sales_count: { decrement: item.quantity },
              popularity_score: {
                decrement: item.quantity * POPULARITY_WEIGHTS.sale,
              },
            },
          }),
        );
      }

      operations.push(
        this.prisma.order.update({
          where: { id: transaction.order_id },
          data: { status: OrderStatus.CANCELLED },
        }),
      );
    }

    const [updated] = await this.prisma.$transaction(operations);
    return updated as PaymeTransaction;
  }

  private createdView(transaction: PaymeTransaction) {
    return {
      create_time: transaction.create_time,
      transaction: transaction.id,
      state: PAYME_STATE_CODES[PaymeState.CREATED],
    };
  }
}

/** Uzunligi turlicha bo'lsa ham vaqt bo'yicha bir xil ishlaydigan solishtirish. */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf-8');
  const bufferB = Buffer.from(b, 'utf-8');

  // `timingSafeEqual` uzunliklar teng bo'lishini talab qiladi. Uzunlikni
  // yashirish uchun ikkalasini ham hash qilamiz - hash uzunligi doim bir xil.
  const hashA = crypto.createHash('sha256').update(bufferA).digest();
  const hashB = crypto.createHash('sha256').update(bufferB).digest();

  return crypto.timingSafeEqual(hashA, hashB);
}
