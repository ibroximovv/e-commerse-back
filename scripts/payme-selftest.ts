/**
 * Payme protokolini LOKALDA boshdan-oxir tekshiradi.
 *
 * Skript Payme serverining o'rnida turadi: o'z webhook'imizga haqiqiy
 * JSON-RPC so'rovlarini yuboradi va javoblarni tekshiradi. Payme kabinetidagi
 * sandbox testi ham xuddi shu holatlarni chaqiradi, shuning uchun bu yerdan
 * o'tsa - u yerdan ham o'tadi.
 *
 * NIMA UCHUN O'ZI TEST MA'LUMOTINI YARATADI
 * -----------------------------------------
 * To'lov uchun `PENDING` buyurtma kerak, buyurtma uchun esa narxi va zaxirasi
 * bor mahsulot. Katalogdagi mahsulotlar `price_on_request` (narxsiz), ular
 * bilan buyurtma qilib bo'lmaydi. Shuning uchun skript o'ziga vaqtinchalik
 * foydalanuvchi + kategoriya + mahsulot + buyurtma yaratadi va OXIRIDA
 * hammasini o'chiradi - bazangizdagi haqiqiy ma'lumotlarga tegmaydi.
 *
 * TALAB:
 *   1) server ishlab tursin:      npm run start:dev
 *   2) `.env` da PAYME_KEY bo'lsin (test kaliti ham bo'ladi)
 *   3) MongoDB replica set rejimida bo'lsin - `$transaction` shuni talab qiladi
 *
 * Ishlatish:
 *   npm run payme:selftest
 *   npm run payme:selftest -- --url https://api.ocomarket.uz
 */
import { PrismaClient, OrderStatus, PaymentStatus } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const urlArg = args.indexOf('--url');
const BASE_URL = (
  urlArg >= 0
    ? args[urlArg + 1]
    : `http://localhost:${process.env.PORT ?? 3000}`
).replace(/\/$/, '');
const ENDPOINT = `${BASE_URL}/api/payments/payme`;

const KEY = process.env.PAYME_KEY ?? '';
const ACCOUNT_FIELD = process.env.PAYME_ACCOUNT_FIELD ?? 'order_id';

/** Test mahsuloti: narx so'mda, chek esa tiyinda ketadi. */
const UNIT_PRICE = 15000;
const QUANTITY = 2;
const START_STOCK = 5;
const TOTAL_SOM = UNIT_PRICE * QUANTITY;
const TOTAL_TIYIN = TOTAL_SOM * 100;

const MARKER = 'payme-selftest';

let passed = 0;
let failed = 0;

function ok(name: string, detail?: string) {
  passed++;
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(name: string, expected: unknown, actual: unknown) {
  failed++;
  console.log(`  ❌ ${name}`);
  console.log(`       kutilgan : ${JSON.stringify(expected)}`);
  console.log(`       keldi    : ${JSON.stringify(actual)}`);
}

interface RpcResponse {
  jsonrpc?: string;
  id?: number;
  result?: any;
  error?: { code: number; message: unknown; data?: string };
}

let rpcId = 0;

async function rpc(
  method: string,
  params: Record<string, unknown>,
  key: string = KEY,
): Promise<RpcResponse & { httpStatus: number }> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method,
      params,
    }),
  });

  const body = (await response.json()) as RpcResponse;
  return { ...body, httpStatus: response.status };
}

/** Xato kodi kutilgan holat. */
function expectError(name: string, res: RpcResponse, code: number) {
  if (res.error?.code === code) {
    ok(name, `${code}`);
  } else {
    bad(name, { error: { code } }, res.error ?? res.result);
  }
}

/**
 * Ikki javobdagi qiymat bir xilligini tekshiradi (idempotentlik).
 *
 * `undefined === undefined` ni O'TDI deb hisoblamaydi: ikkala chaqiruv ham
 * xato bilan tugagan bo'lsa, "bir xil natija qaytdi" degani mantiqsiz -
 * aslida hech qanday natija yo'q.
 */
function expectSame(name: string, first: unknown, second: unknown) {
  if (first === undefined || second === undefined) {
    bad(name, 'ikkala javobda ham qiymat', { first, second });
    return;
  }
  if (first === second) {
    ok(name, `${first}`);
  } else {
    bad(name, first, second);
  }
}

/** Skript yaratgan hamma narsani o'chiradi (marker bo'yicha). */
async function removeLeftovers() {
  const user = await prisma.user.findUnique({
    where: { email: `${MARKER}@example.invalid` },
  });

  if (user) {
    const orders = await prisma.order.findMany({
      where: { user_id: user.id },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);

    if (orderIds.length) {
      await prisma.paymeTransaction.deleteMany({
        where: { order_id: { in: orderIds } },
      });
      await prisma.payment.deleteMany({
        where: { order_id: { in: orderIds } },
      });
      await prisma.orderItem.deleteMany({
        where: { order_id: { in: orderIds } },
      });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
  }

  await prisma.product.deleteMany({ where: { slug: `${MARKER}-product` } });
  await prisma.category.deleteMany({ where: { slug: `${MARKER}-category` } });
  if (user) await prisma.user.delete({ where: { id: user.id } });
}

async function main() {
  console.log('Payme protokoli - lokal tekshiruv\n');
  console.log(`  endpoint : ${ENDPOINT}`);
  console.log(`  account  : ${ACCOUNT_FIELD}`);
  console.log('');

  if (!KEY) {
    console.error(
      "❌ `.env` da PAYME_KEY yo'q - avtorizatsiyani tekshirib bo'lmaydi.",
    );
    process.exit(1);
  }

  try {
    await fetch(ENDPOINT, { method: 'POST' });
  } catch {
    console.error(`❌ Server javob bermadi: ${BASE_URL}`);
    console.error('   Avval `npm run start:dev` ni ishga tushiring.');
    process.exit(1);
  }

  // Kalit mos kelishini OLDIN tekshiramiz. Bo'lmasa har bir metod -32504
  // qaytaradi va hisobotda 20 ta "yiqildi" chiqadi - aslida sabab bitta.
  // Mavjud bo'lmagan tranzaksiya so'raymiz: kalit to'g'ri bo'lsa -31003,
  // noto'g'ri bo'lsa -32504 keladi.
  const probe = await rpc('CheckTransaction', { id: 'selftest-probe' });
  if (probe.error?.code === -32504) {
    console.error('❌ Server sizning PAYME_KEY ingizni qabul qilmadi.\n');
    console.error('   Sabablari:');
    console.error(
      '   1) Server `.env` dagi kalitsiz ishga tushgan - eski jarayon portni',
    );
    console.error("      band qilib turgan bo'lishi mumkin:");
    console.error(
      `        lsof -ti :${new URL(BASE_URL).port || 80} | xargs -r kill`,
    );
    console.error('      keyin `npm run start:dev` ni QAYTA ishga tushiring.');
    console.error(
      "   2) Server va skript boshqa-boshqa PAYME_KEY ko'rayapti (bir xil",
    );
    console.error("      `.env` dan o'qilishi kerak).");
    console.error(
      '\n   Server logida "PAYME_KEY sozlanmagan" bormi - tekshiring.',
    );
    process.exit(1);
  }

  // --- Test ma'lumotlari -------------------------------------------------
  // Oldingi urinish yarim yo'lda uzilgan bo'lsa qoldiqlarni tozalaymiz:
  // `email` va `slug` unikal, aks holda skript boshlanmasdan yiqilardi.
  await removeLeftovers();

  const user = await prisma.user.create({
    data: {
      email: `${MARKER}@example.invalid`,
      password: MARKER,
      full_name: 'Payme Selftest',
      language: 'uz',
      is_verified: true,
    },
  });

  const category = await prisma.category.create({
    data: {
      name_uz: 'Selftest',
      name_ru: 'Selftest',
      name_en: 'Selftest',
      slug: `${MARKER}-category`,
      // Chek qurilishi uchun IKPU va QQS shart, va ular KATEGORIYADA turadi.
      // Bu yerda soxta kod - haqiqiy katalog qamrovini `db:check:ikpu` ko'radi.
      ikpu_code: '00000000000000000',
      vat_percent: 12,
    },
  });

  const product = await prisma.product.create({
    data: {
      name_uz: 'Selftest mahsuloti',
      name_ru: 'Тестовый товар',
      name_en: 'Selftest product',
      slug: `${MARKER}-product`,
      sku: 'PAYME-SELFTEST',
      price: UNIT_PRICE,
      final_price: UNIT_PRICE,
      stock: START_STOCK,
      category_id: category.id,
      // Fiskal maydonlar ataylab bo'sh: kategoriyadan olinishi ham sinaladi.
    },
  });

  const order = await prisma.order.create({
    data: {
      user_id: user.id,
      total_amount: TOTAL_SOM,
      status: OrderStatus.PENDING,
      items: {
        create: [
          {
            product_id: product.id,
            quantity: QUANTITY,
            price_at_purchase: UNIT_PRICE,
          },
        ],
      },
    },
  });

  console.log(`Test buyurtmasi : ${order.id}`);
  console.log(`Summa           : ${TOTAL_SOM} so'm = ${TOTAL_TIYIN} tiyin\n`);

  const account = { [ACCOUNT_FIELD]: order.id };
  const txId = `selftest-${Date.now()}`;
  const otherTxId = `${txId}-other`;

  try {
    // --- 1. Avtorizatsiya ------------------------------------------------
    console.log('1. Avtorizatsiya va protokol');

    const wrongKey = await rpc(
      'CheckPerformTransaction',
      { amount: TOTAL_TIYIN, account },
      'yaroqsiz-kalit',
    );
    expectError("noto'g'ri kalit", wrongKey, -32504);

    if (wrongKey.httpStatus === 200) {
      ok('HTTP status 200 (xatoda ham)');
    } else {
      bad('HTTP status 200 (xatoda ham)', 200, wrongKey.httpStatus);
    }

    expectError(
      "mavjud bo'lmagan metod",
      await rpc('SomeUnknownMethod', {}),
      -32601,
    );

    // --- 2. CheckPerformTransaction --------------------------------------
    console.log('\n2. CheckPerformTransaction');

    expectError(
      'buyurtma topilmadi',
      await rpc('CheckPerformTransaction', {
        amount: TOTAL_TIYIN,
        account: { [ACCOUNT_FIELD]: 'yoq-buyurtma' },
      }),
      -31050,
    );

    expectError(
      'summa mos emas',
      await rpc('CheckPerformTransaction', {
        amount: TOTAL_TIYIN + 1,
        account,
      }),
      -31001,
    );

    const check = await rpc('CheckPerformTransaction', {
      amount: TOTAL_TIYIN,
      account,
    });
    if (check.result?.allow === true) {
      ok("to'lovga ruxsat", 'allow: true');
    } else {
      bad("to'lovga ruxsat", { allow: true }, check.error ?? check.result);
    }

    const items = check.result?.detail?.items ?? [];
    const receiptSum = items.reduce(
      (sum: number, item: any) => sum + item.price * item.count - item.discount,
      0,
    );

    if (
      items.length > 0 &&
      items.every((i: any) => i.code && i.vat_percent !== undefined)
    ) {
      ok('fiskal chek', `${items.length} qator, IKPU: ${items[0].code}`);
    } else {
      bad('fiskal chek (code + vat_percent)', 'har qatorda bor', items);
    }

    if (receiptSum === TOTAL_TIYIN) {
      ok("chek yig'indisi = summa", `${receiptSum} tiyin`);
    } else {
      bad("chek yig'indisi = summa", TOTAL_TIYIN, receiptSum);
    }

    // --- 3. CreateTransaction --------------------------------------------
    console.log('\n3. CreateTransaction');

    const created = await rpc('CreateTransaction', {
      id: txId,
      time: Date.now(),
      amount: TOTAL_TIYIN,
      account,
    });

    if (created.result?.state === 1) {
      ok('tranzaksiya yaratildi', `state: 1`);
    } else {
      bad(
        'tranzaksiya yaratildi',
        { state: 1 },
        created.error ?? created.result,
      );
    }

    const repeat = await rpc('CreateTransaction', {
      id: txId,
      time: Date.now(),
      amount: TOTAL_TIYIN,
      account,
    });

    expectSame(
      "takroriy so'rov idempotent (create_time)",
      created.result?.create_time,
      repeat.result?.create_time,
    );

    expectError(
      'ikkinchi parallel tranzaksiya',
      await rpc('CreateTransaction', {
        id: otherTxId,
        time: Date.now(),
        amount: TOTAL_TIYIN,
        account,
      }),
      -31051,
    );

    const checkTx = await rpc('CheckTransaction', { id: txId });
    if (checkTx.result?.state === 1) {
      ok('CheckTransaction', 'state: 1');
    } else {
      bad('CheckTransaction', { state: 1 }, checkTx.error ?? checkTx.result);
    }

    // --- 4. PerformTransaction -------------------------------------------
    console.log('\n4. PerformTransaction');

    const performed = await rpc('PerformTransaction', { id: txId });
    if (performed.result?.state === 2) {
      ok("to'lov yakunlandi", 'state: 2');
    } else {
      bad(
        "to'lov yakunlandi",
        { state: 2 },
        performed.error ?? performed.result,
      );
      if (performed.error?.code === -31008) {
        console.log(
          '       ⚠️ MongoDB replica set rejimida emasmi? `$transaction` shuni talab qiladi.',
        );
      }
    }

    const afterPerform = await prisma.order.findUnique({
      where: { id: order.id },
    });
    if (afterPerform?.status === OrderStatus.CONFIRMED) {
      ok('buyurtma holati', 'CONFIRMED');
    } else {
      bad('buyurtma holati', 'CONFIRMED', afterPerform?.status);
    }

    const payment = await prisma.payment.findUnique({
      where: { order_id: order.id },
    });
    if (payment?.status === PaymentStatus.SUCCESSFUL) {
      ok("to'lov yozuvi", 'SUCCESSFUL');
    } else {
      bad("to'lov yozuvi", 'SUCCESSFUL', payment?.status);
    }

    const performAgain = await rpc('PerformTransaction', { id: txId });
    expectSame(
      'takroriy PerformTransaction idempotent (perform_time)',
      performed.result?.perform_time,
      performAgain.result?.perform_time,
    );

    expectError(
      "to'langan buyurtmani qayta to'lash",
      await rpc('CheckPerformTransaction', { amount: TOTAL_TIYIN, account }),
      -31052,
    );

    // --- 5. GetStatement --------------------------------------------------
    console.log('\n5. GetStatement');

    const statement = await rpc('GetStatement', {
      from: 0,
      to: Date.now() + 1000,
    });
    const found = (statement.result?.transactions ?? []).find(
      (t: any) => t.id === txId,
    );
    if (found && found.amount === TOTAL_TIYIN) {
      ok(
        'sverkada tranzaksiya bor',
        `${statement.result.transactions.length} ta yozuv`,
      );
    } else {
      bad('sverkada tranzaksiya bor', txId, statement.error ?? found);
    }

    // --- 6. CancelTransaction (qaytarish) ---------------------------------
    console.log('\n6. CancelTransaction (pul qaytarish)');

    const cancelled = await rpc('CancelTransaction', { id: txId, reason: 5 });
    if (cancelled.result?.state === -2) {
      ok("to'langandan keyin bekor qilindi", 'state: -2');
    } else {
      bad(
        "to'langandan keyin bekor qilindi",
        { state: -2 },
        cancelled.error ?? cancelled.result,
      );
    }

    const afterCancel = await prisma.order.findUnique({
      where: { id: order.id },
    });
    if (afterCancel?.status === OrderStatus.CANCELLED) {
      ok('buyurtma bekor qilindi', 'CANCELLED');
    } else {
      bad('buyurtma bekor qilindi', 'CANCELLED', afterCancel?.status);
    }

    const restocked = await prisma.product.findUnique({
      where: { id: product.id },
    });
    if (restocked?.stock === START_STOCK + QUANTITY) {
      ok('zaxira omborga qaytdi', `${START_STOCK} → ${restocked?.stock}`);
    } else {
      bad('zaxira omborga qaytdi', START_STOCK + QUANTITY, restocked?.stock);
    }

    const refund = await prisma.payment.findUnique({
      where: { order_id: order.id },
    });
    if (refund?.status === PaymentStatus.REFUNDED) {
      ok("to'lov yozuvi", 'REFUNDED');
    } else {
      bad("to'lov yozuvi", 'REFUNDED', refund?.status);
    }

    const cancelAgain = await rpc('CancelTransaction', { id: txId, reason: 5 });
    expectSame(
      'takroriy bekor qilish idempotent (cancel_time)',
      cancelled.result?.cancel_time,
      cancelAgain.result?.cancel_time,
    );

    const finalCheck = await rpc('CheckTransaction', { id: txId });
    if (finalCheck.result?.state === -2 && finalCheck.result?.reason === 5) {
      ok('yakuniy CheckTransaction', 'state: -2, reason: 5');
    } else {
      bad(
        'yakuniy CheckTransaction',
        { state: -2, reason: 5 },
        finalCheck.result,
      );
    }

    expectError(
      "mavjud bo'lmagan tranzaksiya",
      await rpc('CheckTransaction', { id: 'yoq-tranzaksiya' }),
      -31003,
    );
  } finally {
    // Tozalash: skript o'zi yaratgan hamma narsani o'chiradi
    await removeLeftovers();
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`Natija: ${passed} ta o'tdi, ${failed} ta yiqildi`);

  if (failed > 0) {
    console.log(
      "\nYiqilgan tekshiruvlar bilan Payme sandbox testidan ham o'tolmaysiz.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "\n✅ Protokol to'liq ishlayapti. Payme kabinetidagi sandbox testiga tayyor.",
    );
  }
}

main()
  .catch((e) => {
    console.error('\nTest xatoligi:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
