import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  Payment,
  PaymeState,
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
import {
  PAYME_STATE_CODES,
  PAYME_STATE_NONE,
  PAYME_TRANSACTION_TIMEOUT_MS,
  PaymeMethod,
  toSom,
  toTiyin,
} from './payme.constants';
import {
  MissingIkpuError,
  ReceiptDefaults,
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
 *   1. Mijoz `POST /api/payments/checkout-link` orqali to'lov havolasini oladi;
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
  onModuleInit() {
    const missing = [
      ['PAYME_MERCHANT_ID', this.merchantId],
      ['PAYME_KEY', this.config.get<string>('PAYME_KEY')],
      ['PAYME_DEFAULT_IKPU_CODE', this.receiptDefaults.ikpuCode],
    ].filter(([, value]) => !value);

    if (missing.length) {
      this.logger.warn(
        `Payme to'liq sozlanmagan: ${missing.map(([key]) => key).join(', ')}. ` +
          "To'lov ishlamaydi.",
      );
    }

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
   * Mahsulotda fiskalizatsiya maydonlari to'ldirilmagan bo'lsa ishlatiladigan
   * zaxira qiymatlar. Ular soliq organidan olinadi va `.env` da saqlanadi.
   */
  private get receiptDefaults(): ReceiptDefaults {
    return {
      ikpuCode: this.config.get<string>('PAYME_DEFAULT_IKPU_CODE') ?? '',
      packageCode: this.config.get<string>('PAYME_DEFAULT_PACKAGE_CODE') ?? '',
      vatPercent: Number(
        this.config.get<string>('PAYME_DEFAULT_VAT_PERCENT') ?? 0,
      ),
      units: Number(this.config.get<string>('PAYME_DEFAULT_UNITS') ?? 0),
    };
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
      if (error instanceof MissingIkpuError) {
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
      this.receiptDefaults,
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

    const existing = await this.findByTransactionId(transactionId);

    if (existing) {
      // Takroriy so'rov: faqat hali kutayotgan tranzaksiyani tasdiqlaymiz
      if (existing.payme_state !== PaymeState.CREATED) {
        throw PaymeError.cannotPerform('transaction is not in created state');
      }
      if (this.isExpired(existing.payme_create_time)) {
        await this.markCancelled(existing, PaymeState.CANCELLED, 4);
        throw PaymeError.cannotPerform('transaction timed out');
      }

      return this.createdView(existing);
    }

    const order = await this.resolveOrder(account);
    this.assertAmountMatches(order.total_amount, amount);

    // Payme 12 soatdan eski tranzaksiyani yaratishga ruxsat bermaydi
    if (Date.now() - time > PAYME_TRANSACTION_TIMEOUT_MS) {
      throw PaymeError.cannotPerform('transaction timed out');
    }

    // Bitta buyurtmada bir vaqtning o'zida faqat bitta faol tranzaksiya
    const active = await this.prisma.payment.findUnique({
      where: { order_id: order.id },
    });

    if (
      active &&
      active.payme_state !== null &&
      active.payme_state !== PaymeState.CANCELLED
    ) {
      throw PaymeError.orderInProgress(this.accountField);
    }

    const now = Date.now();
    const data = {
      amount: toSom(amount as number),
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

    // Bekor qilingan eski tranzaksiya bo'lsa yozuvni qayta ishlatamiz -
    // `order_id` unikal, shuning uchun ikkinchi Payment yarata olmaymiz
    const payment = active
      ? await this.prisma.payment.update({
          where: { id: active.id },
          data,
        })
      : await this.prisma.payment.create({
          data: { ...data, order_id: order.id },
        });

    return this.createdView(payment);
  }

  /** To'lovni yakunlaydi: buyurtma CONFIRMED bo'ladi. */
  private async performTransaction(transactionId: string | undefined) {
    const payment = await this.requireTransaction(transactionId);

    // Allaqachon bajarilgan - o'sha natijani qaytaramiz (idempotentlik)
    if (payment.payme_state === PaymeState.PERFORMED) {
      return {
        transaction: payment.id,
        perform_time: payment.payme_perform_time ?? 0,
        state: PAYME_STATE_CODES[PaymeState.PERFORMED],
      };
    }

    if (payment.payme_state !== PaymeState.CREATED) {
      throw PaymeError.cannotPerform('transaction is cancelled');
    }

    if (this.isExpired(payment.payme_create_time)) {
      await this.markCancelled(payment, PaymeState.CANCELLED, 4);
      throw PaymeError.cannotPerform('transaction timed out');
    }

    const performTime = Date.now();

    // To'lov va buyurtma holati birga o'zgaradi - yarim bajarilgan holat
    // qolib ketmasligi uchun bitta tranzaksiyada
    const [updated] = await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESSFUL,
          payme_state: PaymeState.PERFORMED,
          payme_perform_time: performTime,
        },
      }),
      this.prisma.order.update({
        where: { id: payment.order_id },
        data: { status: OrderStatus.CONFIRMED },
      }),
    ]);

    return {
      transaction: updated.id,
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
    const payment = await this.requireTransaction(transactionId);

    // Allaqachon bekor qilingan - o'sha natijani qaytaramiz (idempotentlik)
    if (
      payment.payme_state === PaymeState.CANCELLED ||
      payment.payme_state === PaymeState.CANCELLED_AFTER_PERFORM
    ) {
      return {
        transaction: payment.id,
        cancel_time: payment.payme_cancel_time ?? 0,
        state: PAYME_STATE_CODES[payment.payme_state],
      };
    }

    const wasPerformed = payment.payme_state === PaymeState.PERFORMED;

    if (wasPerformed) {
      const order = await this.prisma.order.findUnique({
        where: { id: payment.order_id },
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
      payment,
      nextState,
      reason ?? null,
    );

    return {
      transaction: updated.id,
      cancel_time: updated.payme_cancel_time ?? 0,
      state: PAYME_STATE_CODES[nextState],
    };
  }

  /** Tranzaksiya holatini qaytaradi. */
  private async checkTransaction(transactionId: string | undefined) {
    const payment = await this.requireTransaction(transactionId);

    return {
      create_time: payment.payme_create_time ?? 0,
      perform_time: payment.payme_perform_time ?? 0,
      cancel_time: payment.payme_cancel_time ?? 0,
      transaction: payment.id,
      state: payment.payme_state
        ? PAYME_STATE_CODES[payment.payme_state]
        : PAYME_STATE_NONE,
      reason: payment.payme_reason ?? null,
    };
  }

  /** Payme solishtirish (sverka) uchun davr bo'yicha tranzaksiyalarni so'raydi. */
  private async getStatement(from: number | undefined, to: number | undefined) {
    if (typeof from !== 'number' || typeof to !== 'number') {
      throw PaymeError.invalidRequest('from/to');
    }

    const payments = await this.prisma.payment.findMany({
      where: {
        provider: 'payme',
        payme_time: { gte: from, lte: to },
      },
      orderBy: { payme_time: 'asc' },
    });

    const transactions: PaymeTransactionView[] = payments.map((payment) => ({
      id: payment.payme_transaction_id ?? '',
      time: payment.payme_time ?? 0,
      amount: toTiyin(payment.amount),
      account: { [this.accountField]: payment.order_id },
      create_time: payment.payme_create_time ?? 0,
      perform_time: payment.payme_perform_time ?? 0,
      cancel_time: payment.payme_cancel_time ?? 0,
      transaction: payment.id,
      state: payment.payme_state
        ? PAYME_STATE_CODES[payment.payme_state]
        : PAYME_STATE_NONE,
      reason: payment.payme_reason ?? null,
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
    const parts = [
      `m=${this.merchantId}`,
      `ac.${this.accountField}=${orderId}`,
      `a=${toTiyin(amountInSom)}`,
      `l=${lang}`,
      'cr=UZS',
    ];

    if (this.returnUrl) parts.push(`c=${this.returnUrl}`);

    const encoded = Buffer.from(parts.join(';'), 'utf-8').toString('base64');
    return `${this.checkoutUrl.replace(/\/+$/, '')}/${encoded}`;
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

  private assertAmountMatches(
    orderTotalInSom: number,
    amountInTiyin: number | undefined,
  ) {
    if (typeof amountInTiyin !== 'number') throw PaymeError.invalidAmount();
    if (toTiyin(orderTotalInSom) !== Math.round(amountInTiyin)) {
      throw PaymeError.invalidAmount();
    }
  }

  private async findByTransactionId(transactionId: string) {
    return this.prisma.payment.findUnique({
      where: { payme_transaction_id: transactionId },
    });
  }

  private async requireTransaction(transactionId: string | undefined) {
    if (!transactionId) throw PaymeError.invalidRequest('id');

    const payment = await this.findByTransactionId(transactionId);
    if (!payment) throw PaymeError.transactionNotFound();

    return payment;
  }

  /** Yaratilganiga 12 soatdan ko'p bo'lgan tranzaksiya yaroqsiz. */
  private isExpired(createTime: number | null): boolean {
    if (createTime === null) return false;
    return Date.now() - createTime > PAYME_TRANSACTION_TIMEOUT_MS;
  }

  private async markCancelled(
    payment: Payment,
    state: PaymeState,
    reason: number | null,
  ) {
    const cancelTime = Date.now();

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          payme_state: state,
          payme_cancel_time: cancelTime,
          payme_reason: reason,
        },
      }),
    ];

    // To'langan buyurtma qaytarilsa - buyurtmani ham bekor qilamiz
    if (state === PaymeState.CANCELLED_AFTER_PERFORM) {
      operations.push(
        this.prisma.order.update({
          where: { id: payment.order_id },
          data: { status: OrderStatus.CANCELLED },
        }),
      );
    }

    const [updated] = await this.prisma.$transaction(operations);
    return updated as Payment;
  }

  private createdView(payment: Payment) {
    return {
      create_time: payment.payme_create_time ?? 0,
      transaction: payment.id,
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
