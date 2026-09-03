import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymeState, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PaymeService } from './payme.service';
import { PaymeError } from './payme.error';
import { PaymeErrorCode } from './payme.constants';

const PAYME_KEY = 'test_secret_key';
const ORDER_ID = 'order-1';
const TX_ID = 'payme-tx-1';

/**
 * Payme Merchant API ni oddiy xotiradagi baza ustida sinaydi.
 *
 * Payme tarmoq xatosida har bir so'rovni qayta yuboradi, shuning uchun
 * testlarning yarmi aynan IDEMPOTENTLIKni tekshiradi.
 */
describe('PaymeService', () => {
  let service: PaymeService;
  let orders: Map<string, any>;
  let payments: Map<string, any>;
  let orderItems: any[];

  /** Har bir testdan oldin tiklanadi - test ichida `delete env.X` qilish mumkin. */
  let env: Record<string, string>;

  const config = {
    get: (key: string) => env[key],
  };

  const prisma = {
    order: {
      findUnique: jest.fn(({ where }) => orders.get(where.id) ?? null),
      update: jest.fn(({ where, data }) => {
        const order = { ...orders.get(where.id), ...data };
        orders.set(where.id, order);
        return order;
      }),
    },
    payment: {
      findUnique: jest.fn(({ where }) => {
        const list = [...payments.values()];
        if (where.id) return list.find((p) => p.id === where.id) ?? null;
        if (where.order_id) {
          return list.find((p) => p.order_id === where.order_id) ?? null;
        }
        return (
          list.find(
            (p) => p.payme_transaction_id === where.payme_transaction_id,
          ) ?? null
        );
      }),
      findFirst: jest.fn(({ where }) => {
        const list = [...payments.values()];
        if (where?.id) return list.find((p) => p.id === where.id) ?? null;
        if (where?.order_id) {
          return list.find((p) => p.order_id === where.order_id) ?? null;
        }
        if (where?.payme_transaction_id) {
          return (
            list.find(
              (p) => p.payme_transaction_id === where.payme_transaction_id,
            ) ?? null
          );
        }
        return list[0] ?? null;
      }),
      findMany: jest.fn(() => [...payments.values()]),
      create: jest.fn(({ data }) => {
        const payment = { id: `pay-${payments.size + 1}`, ...data };
        payments.set(payment.id, payment);
        return payment;
      }),
      update: jest.fn(({ where, data }) => {
        const payment = { ...payments.get(where.id), ...data };
        payments.set(where.id, payment);
        return payment;
      }),
    },
    orderItem: {
      findMany: jest.fn(() => orderItems),
    },
    // Mock'da haqiqiy tranzaksiya yo'q - operatsiyalar allaqachon bajarilgan
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };

  beforeEach(async () => {
    orders = new Map([
      [
        ORDER_ID,
        {
          id: ORDER_ID,
          total_amount: 1500,
          status: OrderStatus.PENDING,
          user_id: 'user-1',
          user: { language: 'ru' },
        },
      ],
    ]);
    payments = new Map();
    env = {
      PAYME_KEY,
      PAYME_MERCHANT_ID: 'merchant-1',
      PAYME_CHECKOUT_URL: 'https://test.paycom.uz',
      PAYME_ACCOUNT_FIELD: 'order_id',
      PAYME_RETURN_URL: 'https://oco.uz/orders',
      PAYME_DEFAULT_IKPU_CODE: '00702001001000000',
      PAYME_DEFAULT_PACKAGE_CODE: '1508957',
      PAYME_DEFAULT_VAT_PERCENT: '12',
      PAYME_DEFAULT_UNITS: '241092',
    };
    // 1500 so'mlik buyurtma: 750 so'mdan 2 dona
    orderItems = [
      {
        quantity: 2,
        price_at_purchase: 750,
        product: {
          name_uz: 'Avtomatik nasos 1WZB-250',
          name_ru: 'Автоматический насос 1WZB-250',
          name_en: 'Automatic pump 1WZB-250',
          ikpu_code: null,
          package_code: null,
          vat_percent: null,
          units: null,
        },
      },
    ];
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        PaymeService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(PaymeService);
  });

  /** 1500 so'm = 150000 tiyin */
  const AMOUNT = 150_000;
  const account = { order_id: ORDER_ID };

  const call = (method: string, params: Record<string, unknown> = {}) =>
    service.handle({ id: 1, method, params });

  const expectPaymeError = async (promise: Promise<unknown>, code: number) => {
    await expect(promise).rejects.toBeInstanceOf(PaymeError);
    await promise.catch((error: PaymeError) => expect(error.code).toBe(code));
  };

  // -------------------------------------------------------------------------
  // Avtorizatsiya
  // -------------------------------------------------------------------------

  describe('authorize', () => {
    const encode = (value: string) => Buffer.from(value).toString('base64');

    it("to'g'ri kalitni qabul qiladi", () => {
      expect(() =>
        service.authorize(`Basic ${encode(`Paycom:${PAYME_KEY}`)}`),
      ).not.toThrow();
    });

    it("sarlavha bo'lmasa rad etadi", () => {
      expect(() => service.authorize(undefined)).toThrow(PaymeError);
    });

    it("noto'g'ri kalitni rad etadi", () => {
      try {
        service.authorize(`Basic ${encode('Paycom:wrong_key')}`);
        fail('xato kutilgan edi');
      } catch (error) {
        expect((error as PaymeError).code).toBe(
          PaymeErrorCode.INSUFFICIENT_PRIVILEGES,
        );
      }
    });

    it("noto'g'ri login bilan rad etadi", () => {
      expect(() =>
        service.authorize(`Basic ${encode(`admin:${PAYME_KEY}`)}`),
      ).toThrow(PaymeError);
    });

    it("Basic bo'lmagan sxemani rad etadi", () => {
      expect(() => service.authorize(`Bearer ${PAYME_KEY}`)).toThrow(
        PaymeError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // CheckPerformTransaction
  // -------------------------------------------------------------------------

  describe('CheckPerformTransaction', () => {
    it("to'g'ri buyurtma va summa uchun ruxsat beradi", async () => {
      const result: any = await call('CheckPerformTransaction', {
        account,
        amount: AMOUNT,
      });

      expect(result.allow).toBe(true);
    });

    it("javobga fiskal chek qo'shadi", async () => {
      const result: any = await call('CheckPerformTransaction', {
        account,
        amount: AMOUNT,
      });

      expect(result.detail).toEqual({
        receipt_type: 0,
        items: [
          {
            // Xaridorning tili `ru` - chekda ham ruscha nom bo'lishi kerak
            title: 'Автоматический насос 1WZB-250',
            price: 75_000, // 750 so'm tiyinda
            count: 2,
            // Mahsulotda bo'sh - `.env` dagi zaxira qiymatlar ishlatiladi
            code: '00702001001000000',
            package_code: '1508957',
            vat_percent: 12,
            units: 241092,
            discount: 0,
          },
        ],
      });
    });

    it("chek qatorlari yig'indisi to'lov summasiga teng bo'ladi", async () => {
      const result: any = await call('CheckPerformTransaction', {
        account,
        amount: AMOUNT,
      });

      const total = result.detail.items.reduce(
        (sum: number, item: any) => sum + item.price * item.count,
        0,
      );

      expect(total).toBe(AMOUNT);
    });

    it('mahsulotdagi fiskal maydonlar zaxiradan ustun turadi', async () => {
      orderItems[0].product.ikpu_code = '08471001001000000';
      orderItems[0].product.package_code = '1501886';
      orderItems[0].product.vat_percent = 0;
      orderItems[0].product.units = 100_000;

      const result: any = await call('CheckPerformTransaction', {
        account,
        amount: AMOUNT,
      });

      expect(result.detail.items[0]).toMatchObject({
        code: '08471001001000000',
        package_code: '1501886',
        vat_percent: 0,
        units: 100_000,
      });
    });

    it('sozlanmagan units va package_code umuman yuborilmaydi', async () => {
      // `units: 0` yoki `package_code: ""` mavjud bo'lmagan kodlar - Payme
      // ularni rad etadi, shuning uchun maydonning o'zi bo'lmasligi kerak
      delete env.PAYME_DEFAULT_UNITS;
      delete env.PAYME_DEFAULT_PACKAGE_CODE;

      const result: any = await call('CheckPerformTransaction', {
        account,
        amount: AMOUNT,
      });

      const item = result.detail.items[0];
      expect(item).not.toHaveProperty('units');
      expect(item).not.toHaveProperty('package_code');
      // Majburiy maydonlar esa doim bo'lishi kerak
      expect(item.code).toBe('00702001001000000');
      expect(item.vat_percent).toBe(12);
    });

    it("IKPU hech qayerda sozlanmagan bo'lsa -31008 qaytaradi", async () => {
      // Bo'sh `code` bilan yuborsak Payme chekni to'lov paytida rad etardi
      delete env.PAYME_DEFAULT_IKPU_CODE;

      await expectPaymeError(
        call('CheckPerformTransaction', { account, amount: AMOUNT }),
        PaymeErrorCode.CANNOT_PERFORM,
      );
    });

    it("chek yig'indisi buyurtma summasiga mos kelmasa rad etadi", async () => {
      // Buyurtma qatorlari buzilgan: 2 x 700 = 1400, buyurtma esa 1500 so'm.
      // Payme bunday chekni qabul qilmaydi - xatoni to'lovdan OLDIN beramiz.
      orderItems[0].price_at_purchase = 700;

      await expectPaymeError(
        call('CheckPerformTransaction', { account, amount: AMOUNT }),
        PaymeErrorCode.INVALID_AMOUNT,
      );
    });

    it('summa mos kelmasa -31001 qaytaradi', async () => {
      await expectPaymeError(
        call('CheckPerformTransaction', { account, amount: 100 }),
        PaymeErrorCode.INVALID_AMOUNT,
      );
    });

    it('buyurtma topilmasa -31050 qaytaradi', async () => {
      await expectPaymeError(
        call('CheckPerformTransaction', {
          account: { order_id: 'yoq' },
          amount: AMOUNT,
        }),
        PaymeErrorCode.ORDER_NOT_FOUND,
      );
    });

    it("account maydoni bo'sh bo'lsa -31050 qaytaradi", async () => {
      await expectPaymeError(
        call('CheckPerformTransaction', { account: {}, amount: AMOUNT }),
        PaymeErrorCode.ORDER_NOT_FOUND,
      );
    });

    it("bekor qilingan buyurtmani to'lashga ruxsat bermaydi", async () => {
      orders.get(ORDER_ID).status = OrderStatus.CANCELLED;

      await expectPaymeError(
        call('CheckPerformTransaction', { account, amount: AMOUNT }),
        PaymeErrorCode.ORDER_NOT_FOUND,
      );
    });
  });

  // -------------------------------------------------------------------------
  // CreateTransaction
  // -------------------------------------------------------------------------

  describe('CreateTransaction', () => {
    const create = (overrides: Record<string, unknown> = {}) =>
      call('CreateTransaction', {
        id: TX_ID,
        time: Date.now(),
        amount: AMOUNT,
        account,
        ...overrides,
      });

    it('tranzaksiya yaratadi va state=1 qaytaradi', async () => {
      const result: any = await create();

      expect(result.state).toBe(1);
      expect(result.transaction).toBeDefined();
      expect(result.create_time).toBeGreaterThan(0);
      expect(payments.size).toBe(1);
    });

    it("takroriy so'rovda yangi yozuv yaratmaydi (idempotentlik)", async () => {
      const first: any = await create();
      const second: any = await create();

      expect(second).toEqual(first);
      expect(payments.size).toBe(1);
    });

    it("12 soatdan eski so'rovni rad etadi", async () => {
      await expectPaymeError(
        create({ time: Date.now() - 13 * 60 * 60 * 1000 }),
        PaymeErrorCode.CANNOT_PERFORM,
      );
    });

    it("noto'g'ri summa bilan yaratmaydi", async () => {
      await expectPaymeError(
        create({ amount: 999 }),
        PaymeErrorCode.INVALID_AMOUNT,
      );
      expect(payments.size).toBe(0);
    });

    it("buyurtmada boshqa faol tranzaksiya bo'lsa -31051 qaytaradi", async () => {
      await create();

      await expectPaymeError(
        create({ id: 'boshqa-tx' }),
        PaymeErrorCode.ORDER_IN_PROGRESS,
      );
    });

    it('bekor qilingan tranzaksiyadan keyin yangisini yaratishga ruxsat beradi', async () => {
      await create();
      await call('CancelTransaction', { id: TX_ID, reason: 1 });

      const result: any = await create({ id: 'yangi-tx' });

      expect(result.state).toBe(1);
      // `order_id` unikal - eski yozuv qayta ishlatiladi, ikkinchisi yaratilmaydi
      expect(payments.size).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // PerformTransaction
  // -------------------------------------------------------------------------

  describe('PerformTransaction', () => {
    beforeEach(async () => {
      await call('CreateTransaction', {
        id: TX_ID,
        time: Date.now(),
        amount: AMOUNT,
        account,
      });
    });

    it("to'lovni yakunlaydi va buyurtmani CONFIRMED qiladi", async () => {
      const result: any = await call('PerformTransaction', { id: TX_ID });

      expect(result.state).toBe(2);
      expect(result.perform_time).toBeGreaterThan(0);
      expect(orders.get(ORDER_ID).status).toBe(OrderStatus.CONFIRMED);

      const payment = [...payments.values()][0];
      expect(payment.status).toBe(PaymentStatus.SUCCESSFUL);
      expect(payment.payme_state).toBe(PaymeState.PERFORMED);
    });

    it("takroriy so'rovda o'sha natijani qaytaradi (idempotentlik)", async () => {
      const first: any = await call('PerformTransaction', { id: TX_ID });
      const second: any = await call('PerformTransaction', { id: TX_ID });

      expect(second).toEqual(first);
    });

    it("mavjud bo'lmagan tranzaksiya uchun -31003 qaytaradi", async () => {
      await expectPaymeError(
        call('PerformTransaction', { id: 'yoq' }),
        PaymeErrorCode.TRANSACTION_NOT_FOUND,
      );
    });

    it('bekor qilingan tranzaksiyani bajarmaydi', async () => {
      await call('CancelTransaction', { id: TX_ID, reason: 1 });

      await expectPaymeError(
        call('PerformTransaction', { id: TX_ID }),
        PaymeErrorCode.CANNOT_PERFORM,
      );
      expect(orders.get(ORDER_ID).status).toBe(OrderStatus.PENDING);
    });
  });

  // -------------------------------------------------------------------------
  // CancelTransaction
  // -------------------------------------------------------------------------

  describe('CancelTransaction', () => {
    beforeEach(async () => {
      await call('CreateTransaction', {
        id: TX_ID,
        time: Date.now(),
        amount: AMOUNT,
        account,
      });
    });

    it('bajarilmagan tranzaksiyani state=-1 bilan bekor qiladi', async () => {
      const result: any = await call('CancelTransaction', {
        id: TX_ID,
        reason: 1,
      });

      expect(result.state).toBe(-1);
      expect(result.cancel_time).toBeGreaterThan(0);
      // To'lov o'tmagani uchun buyurtma o'z holicha qoladi
      expect(orders.get(ORDER_ID).status).toBe(OrderStatus.PENDING);
    });

    it('bajarilgan tranzaksiyani state=-2 bilan qaytaradi', async () => {
      await call('PerformTransaction', { id: TX_ID });

      const result: any = await call('CancelTransaction', {
        id: TX_ID,
        reason: 5,
      });

      expect(result.state).toBe(-2);
      expect(orders.get(ORDER_ID).status).toBe(OrderStatus.CANCELLED);
    });

    it('yetkazib berilgan buyurtmani bekor qilmaydi (-31007)', async () => {
      await call('PerformTransaction', { id: TX_ID });
      orders.get(ORDER_ID).status = OrderStatus.DELIVERED;

      await expectPaymeError(
        call('CancelTransaction', { id: TX_ID, reason: 5 }),
        PaymeErrorCode.CANNOT_CANCEL,
      );
    });

    it("takroriy bekor qilishda o'sha natijani qaytaradi (idempotentlik)", async () => {
      const first: any = await call('CancelTransaction', {
        id: TX_ID,
        reason: 1,
      });
      const second: any = await call('CancelTransaction', {
        id: TX_ID,
        reason: 1,
      });

      expect(second).toEqual(first);
    });
  });

  // -------------------------------------------------------------------------
  // CheckTransaction / GetStatement / noma'lum metod
  // -------------------------------------------------------------------------

  describe('CheckTransaction', () => {
    it('joriy holatni qaytaradi', async () => {
      await call('CreateTransaction', {
        id: TX_ID,
        time: Date.now(),
        amount: AMOUNT,
        account,
      });
      await call('PerformTransaction', { id: TX_ID });

      const result: any = await call('CheckTransaction', { id: TX_ID });

      expect(result.state).toBe(2);
      expect(result.perform_time).toBeGreaterThan(0);
      expect(result.cancel_time).toBe(0);
      expect(result.reason).toBeNull();
    });

    it("mavjud bo'lmagan tranzaksiya uchun -31003 qaytaradi", async () => {
      await expectPaymeError(
        call('CheckTransaction', { id: 'yoq' }),
        PaymeErrorCode.TRANSACTION_NOT_FOUND,
      );
    });
  });

  describe('GetStatement', () => {
    it('davr ichidagi tranzaksiyalarni tiyinda qaytaradi', async () => {
      await call('CreateTransaction', {
        id: TX_ID,
        time: Date.now(),
        amount: AMOUNT,
        account,
      });

      const result: any = await call('GetStatement', {
        from: Date.now() - 1000,
        to: Date.now() + 1000,
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        id: TX_ID,
        amount: AMOUNT,
        account: { order_id: ORDER_ID },
        state: 1,
      });
    });
  });

  it("noma'lum metod uchun -32601 qaytaradi", async () => {
    await expectPaymeError(call('MakeMeRich'), PaymeErrorCode.METHOD_NOT_FOUND);
  });

  // -------------------------------------------------------------------------
  // Kassa havolasi
  // -------------------------------------------------------------------------

  describe('buildCheckoutUrl', () => {
    it("base64 payload bilan to'g'ri havola quradi", () => {
      const url = service.buildCheckoutUrl(ORDER_ID, 1500, 'ru');
      const encoded = url.replace('https://test.paycom.uz/', '');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');

      expect(decoded).toBe(
        `m=merchant-1;ac.order_id=${ORDER_ID};a=150000;l=ru;cr=UZS;` +
          'c=https://oco.uz/orders',
      );
    });
  });
});
