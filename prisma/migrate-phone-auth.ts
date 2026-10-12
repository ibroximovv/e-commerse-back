/**
 * Email/OTP auth'dan telefon + ism auth'ga va butun so'mli narxlarga o'tish.
 *
 *   npm run db:migrate:phone-auth -- --dry-run      # faqat hisobot
 *   npm run db:migrate:phone-auth                   # qo'llaydi
 *   npm run db:migrate:phone-auth -- --admin-phone=+998901234567
 *   npm run db:migrate:phone-auth -- --set-phone=<userId>=+998901234567
 *
 * Nima qiladi (har qadam idempotent - qayta ishga tushirish xavfsiz):
 *
 *  1. `User` kolleksiyasining nusxasini `User_backup_phone_auth` ga oladi
 *     (faqat birinchi marta - keyingi ishga tushirishlar nusxani bosib ketmaydi).
 *  2. Har bir foydalanuvchida:
 *       - `phone` -> `+998XXXXXXXXX` (yaroqsiz bo'lsa `null`, hisobotda ko'rinadi);
 *       - `full_name` bo'sh bo'lsa - email'ning `@` gacha qismi yoki "Mijoz";
 *       - `email`, `is_verified` o'chiriladi;
 *       - `password` faqat ADMIN'da qoladi (admin panelga telefon + parol).
 *  3. Bir xil telefon bir nechta hisobda bo'lsa - raqam bittasida qoladi
 *     (ADMIN > tasdiqlangan > buyurtmasi ko'p > eskiroq), qolganlarida `null`.
 *     Ular hisobotda chiqadi - kerak bo'lsa qo'lda birlashtiriladi.
 *  4. `User_email_key` unikal indeksi foydalanuvchilar yangilanishidan OLDIN
 *     o'chiriladi (aks holda email'siz ikkinchi hujjat E11000 bilan yiqiladi),
 *     keyin `phone` ga QISMAN unikal indeks yaratiladi: faqat `phone` satr
 *     bo'lgan hujjatlar uchun.
 *  5. Narxlar butun so'mga yaxlitlanadi: `Product.price/discount_price/final_price`
 *     va hali to'lanmagan (`PENDING`, Payme tranzaksiyasi yo'q) buyurtmalar.
 *     To'langan buyurtma va Payme yozuvlariga TEGILMAYDI - sverka buzilmasin.
 *
 * `phone` ga Prisma'da `@unique` qo'yilmagan, shuning uchun `prisma db push`
 * bu indeksni o'chirib yuborsa, skriptni qayta ishga tushiring.
 */
import { OrderStatus, Prisma, PrismaClient, Role } from '@prisma/client';
import { cleanFullName, normalizePhone } from '../src/common/utils/phone.util';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const BACKUP_COLLECTION = 'User_backup_phone_auth';
const PHONE_INDEX = 'User_phone_unique_partial';
const LEGACY_EMAIL_INDEX = 'User_email_key';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function args(name: string): string[] {
  const prefix = `--${name}=`;
  return process.argv
    .filter((a) => a.startsWith(prefix))
    .map((a) => a.slice(prefix.length));
}

interface RawUser {
  _id: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  password?: string | null;
  role?: Role;
  is_verified?: boolean;
  created_at?: { $date: string } | string;
}

interface PlannedUser {
  id: string;
  label: string;
  role: Role;
  verified: boolean;
  createdAt: number;
  orders: number;
  phone: string | null;
  fullName: string;
  set: Record<string, unknown>;
  unset: Record<string, ''>;
}

const report = {
  phoneNormalized: 0,
  phoneInvalid: [] as string[],
  phoneMissing: [] as string[],
  nameFilled: [] as string[],
  passwordsRemoved: 0,
  duplicates: [] as string[],
  adminsWithoutPhone: [] as string[],
  productsRounded: 0,
  ordersRounded: 0,
};

async function main() {
  console.log(DRY_RUN ? '--- DRY RUN (hech narsa yozilmaydi) ---\n' : '');

  await backupUsers();
  const planned = await planUsers();
  resolveDuplicatePhones(planned);
  await dropLegacyEmailIndex();
  await applyUsers(planned);
  await ensurePhoneIndex();
  await roundProducts();
  await roundPendingOrders();
  printReport();
}

// ---------------------------------------------------------------------------
// 1. Zaxira nusxa
// ---------------------------------------------------------------------------

async function backupUsers() {
  const existing = await listCollections();
  if (existing.includes(BACKUP_COLLECTION)) {
    console.log(`Zaxira bor: ${BACKUP_COLLECTION} (qayta yozilmaydi)`);
    return;
  }

  console.log(`Zaxira: User -> ${BACKUP_COLLECTION}`);
  if (DRY_RUN) return;

  await prisma.$runCommandRaw({
    aggregate: 'User',
    pipeline: [{ $match: {} }, { $out: BACKUP_COLLECTION }],
    cursor: {},
  });
}

// ---------------------------------------------------------------------------
// 2. Foydalanuvchilar
// ---------------------------------------------------------------------------

async function planUsers(): Promise<PlannedUser[]> {
  const users = (await prisma.user.findRaw({
    filter: {},
  })) as unknown as RawUser[];

  const orderCounts = new Map<string, number>();
  for (const row of await prisma.order.groupBy({
    by: ['user_id'],
    _count: { _all: true },
  })) {
    orderCounts.set(row.user_id, row._count._all);
  }

  const manualPhones = new Map<string, string>();
  for (const pair of args('set-phone')) {
    const [id, phone] = pair.split('=');
    const normalized = normalizePhone(phone);
    if (!id || !normalized) {
      throw new Error(
        `--set-phone=${pair} noto'g'ri (kutilgan: <id>=<telefon>)`,
      );
    }
    manualPhones.set(id, normalized);
  }

  const adminPhone = arg('admin-phone');
  const normalizedAdminPhone = adminPhone ? normalizePhone(adminPhone) : null;
  if (adminPhone && !normalizedAdminPhone) {
    throw new Error(`--admin-phone=${adminPhone} noto'g'ri`);
  }
  const adminsWithoutPhone = users.filter(
    (u) => u.role === Role.ADMIN && !normalizePhone(u.phone),
  );
  if (normalizedAdminPhone && adminsWithoutPhone.length === 1) {
    manualPhones.set(adminsWithoutPhone[0]._id, normalizedAdminPhone);
  } else if (normalizedAdminPhone && adminsWithoutPhone.length > 1) {
    throw new Error(
      `Telefonsiz ADMIN ${adminsWithoutPhone.length} ta - --admin-phone o'rniga ` +
        `--set-phone=<id>=<telefon> ishlating: ` +
        adminsWithoutPhone.map((u) => u._id).join(', '),
    );
  }

  return users.map((u) => {
    const role = u.role ?? Role.USER;
    const label = `${u._id} (${u.email ?? u.phone ?? 'n/a'}, ${role})`;
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};

    // Telefon
    let phone = manualPhones.get(u._id) ?? normalizePhone(u.phone);
    if (!phone && u.phone && String(u.phone).trim()) {
      report.phoneInvalid.push(`${label}: "${u.phone}"`);
    }
    if (phone && phone !== u.phone) report.phoneNormalized += 1;
    if (!phone) phone = null;

    // Ism
    let fullName = cleanFullName(u.full_name);
    if (!fullName) {
      fullName = cleanFullName(u.email?.split('@')[0]) || 'Mijoz';
      report.nameFilled.push(`${label} -> "${fullName}"`);
    }
    if (fullName !== u.full_name) set.full_name = fullName;

    // Email/OTP qoldiqlari
    if (u.email !== undefined) unset.email = '';
    if (u.is_verified !== undefined) unset.is_verified = '';

    // Parol faqat adminda
    if (role !== Role.ADMIN && u.password) {
      unset.password = '';
      report.passwordsRemoved += 1;
    }

    const created =
      typeof u.created_at === 'string'
        ? u.created_at
        : (u.created_at?.$date ?? new Date().toISOString());

    return {
      id: u._id,
      label,
      role,
      verified: u.is_verified !== false,
      createdAt: new Date(created).getTime(),
      orders: orderCounts.get(u._id) ?? 0,
      phone,
      fullName,
      set,
      unset,
    };
  });
}

function resolveDuplicatePhones(planned: PlannedUser[]) {
  const byPhone = new Map<string, PlannedUser[]>();
  for (const user of planned) {
    if (!user.phone) continue;
    byPhone.set(user.phone, [...(byPhone.get(user.phone) ?? []), user]);
  }

  for (const [phone, group] of byPhone) {
    if (group.length < 2) continue;

    group.sort(
      (a, b) =>
        Number(b.role === Role.ADMIN) - Number(a.role === Role.ADMIN) ||
        Number(b.verified) - Number(a.verified) ||
        b.orders - a.orders ||
        a.createdAt - b.createdAt,
    );

    const [keeper, ...rest] = group;
    for (const user of rest) user.phone = null;
    report.duplicates.push(
      `${phone}: qoldi -> ${keeper.label}; raqami olindi -> ` +
        rest.map((u) => u.label).join(', '),
    );
  }

  for (const user of planned) {
    if (!user.phone) {
      if (user.role === Role.ADMIN) report.adminsWithoutPhone.push(user.label);
      else report.phoneMissing.push(user.label);
    }
  }
}

async function applyUsers(planned: PlannedUser[]) {
  const raw = (await prisma.user.findRaw({
    filter: {},
    options: { projection: { phone: 1 } },
  })) as unknown as Array<{ _id: string; phone?: string | null }>;
  const currentPhone = new Map(raw.map((u) => [u._id, u.phone ?? null]));

  // 1-bosqich: o'zgaradigan raqamlar avval bo'shatiladi. Aks holda qisman
  // unikal indeks bor bazada (qayta ishga tushirish) A ning yangi raqami
  // hali B da turgan bo'lsa, tartibga qarab E11000 chiqardi.
  const clearing: RawUpdate[] = [];
  const updates: RawUpdate[] = [];

  for (const user of planned) {
    const set = { ...user.set };
    const unset = { ...user.unset };
    const before = currentPhone.get(user.id) ?? null;

    if (user.phone !== before) {
      if (before)
        clearing.push({ q: { _id: user.id }, u: { $unset: { phone: '' } } });
      if (user.phone) set.phone = user.phone;
    }

    const u: RawUpdate['u'] = {};
    if (Object.keys(set).length) u.$set = set;
    if (Object.keys(unset).length) u.$unset = unset;
    if (Object.keys(u).length) updates.push({ q: { _id: user.id }, u });
  }

  console.log(
    `Foydalanuvchilar: ${planned.length}, o'zgaradi: ${updates.length}`,
  );
  if (DRY_RUN) return;

  for (const batch of [clearing, updates]) {
    if (batch.length === 0) continue;
    const result = (await prisma.$runCommandRaw({
      update: 'User',
      updates: batch as unknown as Prisma.InputJsonValue[],
      ordered: true,
    })) as { writeErrors?: Array<{ index: number; errmsg: string }> };

    // `update` buyrug'i xatoni tashlamaydi - javob ichida qaytaradi
    if (result.writeErrors?.length) {
      throw new Error(
        'User yangilanmadi: ' +
          result.writeErrors
            .map((e) => `${JSON.stringify(batch[e.index].q)}: ${e.errmsg}`)
            .join('; '),
      );
    }
  }
}

interface RawUpdate {
  q: { _id: string };
  u: { $set?: Record<string, unknown>; $unset?: Record<string, ''> };
}

// ---------------------------------------------------------------------------
// 4. Indekslar
// ---------------------------------------------------------------------------

/**
 * `listIndexes` emas: qisman indeks spetsifikatsiyasidagi `{ $type: 'string' }`
 * ni Prisma o'zining teg qiymati deb o'qib, "Unknown tagged value" bilan
 * yiqiladi. `$indexStats` dan esa faqat nom olinadi.
 */
async function userIndexNames(): Promise<string[]> {
  const result = (await prisma.$runCommandRaw({
    aggregate: 'User',
    pipeline: [{ $indexStats: {} }, { $project: { _id: 0, name: 1 } }],
    cursor: {},
  })) as { cursor: { firstBatch: Array<{ name: string }> } };
  return result.cursor.firstBatch.map((i) => i.name);
}

/** Foydalanuvchilarni yangilashdan OLDIN: email o'chirilgach bir nechta `null` to'qnashardi. */
async function dropLegacyEmailIndex() {
  if (!(await userIndexNames()).includes(LEGACY_EMAIL_INDEX)) return;

  console.log(`Indeks o'chiriladi: ${LEGACY_EMAIL_INDEX}`);
  if (DRY_RUN) return;
  await prisma.$runCommandRaw({
    dropIndexes: 'User',
    index: LEGACY_EMAIL_INDEX,
  });
}

/** Foydalanuvchilar yangilangandan KEYIN: takroriy raqamlar allaqachon bo'shatilgan. */
async function ensurePhoneIndex() {
  if ((await userIndexNames()).includes(PHONE_INDEX)) return;

  console.log(`Indeks yaratiladi: ${PHONE_INDEX} (phone, unique, partial)`);
  if (DRY_RUN) return;
  await prisma.$runCommandRaw({
    createIndexes: 'User',
    indexes: [
      {
        key: { phone: 1 },
        name: PHONE_INDEX,
        unique: true,
        partialFilterExpression: { phone: { $type: 'string' } },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 5. Narxlar -> butun so'm
// ---------------------------------------------------------------------------

function isFractional(value: unknown): boolean {
  return typeof value === 'number' && !Number.isInteger(value);
}

async function roundProducts() {
  const products = await prisma.product.findMany({
    select: { id: true, price: true, discount_price: true, final_price: true },
  });

  for (const p of products) {
    if (
      !isFractional(p.price) &&
      !isFractional(p.discount_price) &&
      !isFractional(p.final_price)
    ) {
      continue;
    }

    const price = Math.round(p.price);
    const discount =
      p.discount_price === null ? null : Math.round(p.discount_price);
    const hasDiscount = discount !== null && discount >= 0 && discount < price;
    const finalPrice = hasDiscount ? discount : price;

    report.productsRounded += 1;
    if (DRY_RUN) continue;

    await prisma.product.update({
      where: { id: p.id },
      data: {
        price,
        discount_price: hasDiscount ? discount : null,
        final_price: finalPrice,
        discount_percent:
          hasDiscount && price > 0
            ? Math.round(((price - finalPrice) / price) * 100)
            : 0,
      },
    });
  }
}

async function roundPendingOrders() {
  const orders = await prisma.order.findMany({
    where: { status: OrderStatus.PENDING, payme_transactions: { none: {} } },
    select: {
      id: true,
      total_amount: true,
      items: { select: { id: true, quantity: true, price_at_purchase: true } },
    },
  });

  for (const order of orders) {
    const needs =
      isFractional(order.total_amount) ||
      order.items.some((i) => isFractional(i.price_at_purchase));
    if (!needs) continue;

    report.ordersRounded += 1;
    if (DRY_RUN) continue;

    // Payme chek qoidasi: total == Σ(price × count). Shuning uchun jami
    // yaxlitlangan qatorlardan qayta yig'iladi, alohida yaxlitlanmaydi.
    let total = 0;
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const price = Math.round(item.price_at_purchase);
        total += price * item.quantity;
        await tx.orderItem.update({
          where: { id: item.id },
          data: { price_at_purchase: price },
        });
      }
      await tx.order.update({
        where: { id: order.id },
        data: { total_amount: total },
      });
    });
  }
}

// ---------------------------------------------------------------------------

async function listCollections(): Promise<string[]> {
  const result = (await prisma.$runCommandRaw({
    listCollections: 1,
    nameOnly: true,
  })) as { cursor: { firstBatch: Array<{ name: string }> } };
  return result.cursor.firstBatch.map((c) => c.name);
}

function printList(title: string, items: string[]) {
  if (items.length === 0) return;
  console.log(`\n${title} (${items.length}):`);
  for (const item of items) console.log(`  - ${item}`);
}

function printReport() {
  console.log('\n=== Hisobot ===');
  console.log(`Telefon normallashtirildi : ${report.phoneNormalized}`);
  console.log(`Parol olib tashlandi (USER): ${report.passwordsRemoved}`);
  console.log(`Narxi yaxlitlangan mahsulot: ${report.productsRounded}`);
  console.log(`Yaxlitlangan PENDING buyurtma: ${report.ordersRounded}`);
  printList("Ism to'ldirildi", report.nameFilled);
  printList('Yaroqsiz telefon (null qilindi)', report.phoneInvalid);
  printList('Takroriy telefon', report.duplicates);
  printList(
    "Telefonsiz USER - tizimga kira olmaydi, qayta ro'yxatdan o'tadi",
    report.phoneMissing,
  );
  printList(
    '⚠️  Telefonsiz ADMIN - panelga kira olmaydi! --admin-phone=... yoki --set-phone=<id>=... bilan qayta ishga tushiring',
    report.adminsWithoutPhone,
  );
  if (DRY_RUN) console.log('\nDRY RUN: hech narsa yozilmadi.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
