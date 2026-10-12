# Front uchun o'zgarishlar: telefon + ism bilan kirish, narxlar so'mda

**Sana:** 2026-10-12
**Kimga:** client (do'kon) va admin panel frontend jamoasi
**Qamrov:** autentifikatsiya, foydalanuvchi profili, narxlar, buyurtma

---

## 1. Qisqacha nima o'zgardi

| Mavzu | Avval | Endi |
|---|---|---|
| Ro'yxatdan o'tish | email + parol → emailga OTP → `verify` → yana `login` | **ism + telefon** → javobda darhol tokenlar |
| Kirish (mijoz) | email + parol | **telefon + ism** |
| Kirish (admin) | email + parol | **telefon + parol** |
| Email | hamma joyda | **butunlay olib tashlandi** |
| Parol (mijoz) | bor | **yo'q** |
| Auth ichki tuzilishi | qo'lda yozilgan guard | **Passport.js** (`jwt` + `phone` strategiyalari) |
| Narxlar | kasr bo'lishi mumkin edi (`999.99`) | **butun so'm (UZS)**, har javobda `currency: "UZS"` |
| Checkout | ism/telefon qayta so'ralardi | yuborilmasa **profildan olinadi** |

---

## 2. ⚠️ Breaking changes

### 2.1. O'chirilgan endpointlar (endi `404`)

```
POST /api/auth/verify
POST /api/auth/resend-code
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

OTP kiritish, "kodni qayta yuborish", "parolni unutdingizmi" sahifalari va
ularning formalarini **o'chiring**.

### 2.2. `user` obyektidan olib tashlangan maydonlar

- `email`
- `is_verified`

Yangi `user` ko'rinishi (login, register, `GET /api/users/profile`):

```ts
interface User {
  id: string;
  full_name: string;        // endi doim bor
  phone: string | null;     // "+998901234567" (E.164)
  role: 'USER' | 'ADMIN';
  photo: string | null;
  language: 'uz' | 'ru' | 'en';
  created_at: string;
  updated_at: string;
}
```

### 2.3. JWT ichidagi payload

```json
{ "sub": "<user id>", "phone": "+998901234567", "role": "USER", "language": "uz" }
```

`email` endi yo'q. Tokendan email o'qiyotgan joy bo'lsa — `phone` ga o'tkazing.

### 2.4. `change-password` faqat ADMIN uchun

Mijozda parol yo'q, shuning uchun `POST /api/auth/change-password` endi faqat
`ADMIN` token bilan ishlaydi (`USER` → `403`). Yangi parol kamida **8 belgi**.

### 2.5. Statistika

- `GET /api/users/stats` → `verified_users` maydoni **olib tashlandi**.
- `GET /api/dashboard/...` → `users.verified_users` **olib tashlandi**.
- `GET /api/users?sortBy=email` endi ishlamaydi → `sortBy=phone` ishlating.
  `search` endi `full_name` va `phone` bo'yicha qidiradi.

---

## 3. Client (do'kon): ro'yxatdan o'tish va kirish

### 3.1. Ro'yxatdan o'tish

```
POST /api/auth/register?ln=uz
Content-Type: application/json

{ "full_name": "Aziza Karimova", "phone": "90 111 22 33" }
```

- `phone` istalgan ko'rinishda yuborilishi mumkin: `901112233`,
  `+998 (90) 111-22-33`, `998901112233` — server `+998901112233` ga keltiradi.
- `full_name`: 2–100 belgi. Chetdagi va ortiqcha bo'shliqlar olib tashlanadi.
- Profil tili `?ln=` dan olinadi (`uz` default) — alohida maydon kerak emas.

**Javob `201`** — login bilan **bir xil** shaklda, ya'ni foydalanuvchi darhol
tizimga kirgan bo'ladi, qayta login qilish **shart emas**:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "a0804ce1-…",
      "full_name": "Aziza Karimova",
      "phone": "+998901112233",
      "role": "USER",
      "photo": null,
      "language": "uz",
      "created_at": "2026-10-12T08:07:05.405Z",
      "updated_at": "2026-10-12T08:07:05.405Z"
    },
    "access_token": "eyJ…",
    "refresh_token": "eyJ…"
  },
  "language": "uz",
  "currency": "UZS"
}
```

| Holat | Kod | `message` (uz) |
|---|---|---|
| Raqam allaqachon bor | `409` | Bu telefon raqami allaqachon ro'yxatdan o'tgan. Iltimos, tizimga kiring. |
| Raqam yaroqsiz | `400` | Telefon raqami noto'g'ri. |
| Ism bo'sh/qisqa | `400` | validatsiya xatosi |

> **UX tavsiya:** `409` kelsa, kiritilgan raqam va ism bilan avtomatik
> `login` ga urinib ko'ring — foydalanuvchi "allaqachon ro'yxatdan o'tgansiz"
> xatosini umuman ko'rmaydi.

### 3.2. Kirish

```
POST /api/auth/login
{ "phone": "+998901112233", "full_name": "Aziza Karimova" }
```

- Ism **registr va ortiqcha bo'shliqlarsiz** solishtiriladi:
  `"aziza  KARIMOVA"` ham o'tadi. Lekin lotin/kirill farq qiladi:
  `"Азиза Каримова"` ≠ `"Aziza Karimova"`. Formada foydalanuvchiga
  "ro'yxatdan o'tgandagi ismingizni yozing" deb ko'rsating.
- Javob — 3.1 dagi bilan bir xil (`user`, `access_token`, `refresh_token`).

| Holat | Kod | `message` (uz) |
|---|---|---|
| Raqam yoki ism noto'g'ri | `401` | Telefon raqami yoki ism noto'g'ri. |
| 15 daqiqada 5 ta xato | `429` | Juda ko'p urinish. Iltimos, birozdan so'ng qayta urinib ko'ring. |

> Server raqam ro'yxatdan o'tgan-o'tmaganini **oshkor qilmaydi** — ikkala
> holatda ham bir xil `401`. "Bunday raqam topilmadi" deb yozmang.

### 3.3. Tavsiya etilgan bitta forma

Alohida "Kirish" va "Ro'yxatdan o'tish" sahifalari shart emas:

```ts
async function signIn(full_name: string, phone: string) {
  try {
    return await api.post('/api/auth/login', { phone, full_name });
  } catch (e) {
    if (e.status !== 401) throw e;
    // Bunday raqam yo'q bo'lishi mumkin - ro'yxatdan o'tkazamiz
    return await api.post(`/api/auth/register?ln=${lang}`, { phone, full_name });
    // 409 qaytsa - raqam bor, lekin ism mos emas: "Ism noto'g'ri" deb ko'rsating
  }
}
```

Javobdagi `access_token`, `refresh_token` va `user` ni saqlang — shu bilan
tamom, keyingi qadam darhol savat/checkout.

### 3.4. Telefon maskasi

Inputda `+998 (__) ___-__-__` maskasidan foydalanish mumkin — server baribir
faqat raqamlarni oladi. 9 ta raqam yuborilsa `+998` avtomatik qo'shiladi.

### 3.5. Profilni tahrirlash

```
PATCH /api/users/profile
{ "full_name": "Aziza K.", "phone": "+998901112234", "language": "ru", "photo": "uploads/x.png" }
```

- ⚠️ `full_name` yoki `phone` o'zgarsa — keyingi **loginda yangisi** ishlatiladi.
  Buni foydalanuvchiga ogohlantirish sifatida ko'rsating.
- Boshqa foydalanuvchining raqami → `409`.

### 3.6. Tokenlar (o'zgarmagan)

```
POST /api/auth/refresh  { "refresh_token": "…" }  → { access_token, refresh_token }
POST /api/auth/logout                                → { message } (stateless)
```

Himoyalangan so'rovlarda: `Authorization: Bearer <access_token>`.
`401` → `refresh` → yana `401` → login formasi.

---

## 4. Admin panel: kirish

```
POST /api/auth/login
{ "phone": "+998901234567", "password": "••••••••" }
```

- ADMIN uchun **parol majburiy**, `full_name` e'tiborga olinmaydi.
  (Aks holda admin telefoni va ismini bilgan har kim panelga kirardi.)
- Xato bo'lsa — `401`, matn mijozdagi bilan bir xil ("Telefon raqami yoki ism
  noto'g'ri") — admin formada o'zingizning "Telefon yoki parol noto'g'ri"
  matningizni ko'rsatishingiz mumkin.
- Javobdagi `user.role === 'ADMIN'` ni tekshiring.
- Admin parolini almashtirish: `POST /api/auth/change-password`
  `{ old_password, new_password }` (yangi parol ≥ 8 belgi).

Login formasidagi **email** maydonini **telefon** maydoniga almashtiring.

### Admin panelda boshqa joylar

| Joy | O'zgarish |
|---|---|
| Foydalanuvchilar jadvali | `email` ustunini olib tashlang, `phone` ko'rsating |
| Foydalanuvchilar qidiruvi | `search` → ism yoki telefon |
| Saralash | `sortBy=email` → `sortBy=phone` |
| Buyurtmalar qidiruvi | foydalanuvchi emaili o'rniga telefoni bo'yicha |
| Buyurtma/to'lov ichidagi `user` | `{ id, full_name, phone }` (email yo'q) |
| Statistika | `verified_users` kartochkasini olib tashlang |

---

## 5. Narxlar — butun o'zbek so'mida

Barcha summalar **UZS, butun son** (tiyinsiz):

| Maydon | Misol |
|---|---|
| `product.price`, `discount_price`, `final_price` | `1250000`, `990000` |
| `cart.totals.subtotal / original_total / discount_total` | `2970000` |
| `order.total_amount`, `items[].price_at_purchase` | `2970000`, `990000` |
| `payment.amount` | `2970000` |
| dashboard `revenue.*` | butun son |

- Har bir javob konvertida yangi maydon bor: **`"currency": "UZS"`**.
- Frontendda formatlash:

  ```ts
  const formatSom = (n: number) =>
    new Intl.NumberFormat('uz-UZ').format(n) + " so'm";   // 1 250 000 so'm
  // ru: `${new Intl.NumberFormat('ru-RU').format(n)} сум`
  ```

- **Admin mahsulot formasi:** `price` va `discount_price` endi **butun son**
  bo'lishi shart (`@IsInt`). `999.99` yuborilsa → `400`. Inputda
  `step="1"` qo'ying va kasr kiritishga yo'l qo'ymang.
- `price_on_request: true` tovarlar o'zgarmagan: narx `0`, "Narx kelishilgan
  holda" deb ko'rsating.

---

## 6. Checkout — kamroq ma'lumot so'rang

```
POST /api/orders/checkout
{ "shipping_address": "Toshkent, Amir Temur 45" }
```

`customer_name` va `customer_phone` **yuborilmasa** — profildagi ism va
telefon yoziladi. Formada ularni profil qiymati bilan oldindan to'ldiring va
faqat "boshqa odam qabul qiladi" holatida o'zgartirishga ruxsat bering.

---

## 7. Eski foydalanuvchilar (migratsiyadan keyin)

Backendda `npm run db:migrate:phone-auth` ishga tushiriladi:

- Telefoni bor eski foydalanuvchi → **o'sha telefon + profildagi ism** bilan kiradi.
- Telefoni bo'lmagan eski foydalanuvchi → kira olmaydi, **qaytadan ro'yxatdan
  o'tadi** (eski buyurtmalari eski hisobda qoladi; admin kerak bo'lsa
  `PATCH /api/users/:id` bilan eski hisobga telefon qo'shib bera oladi).
- Eski tokenlar ichida `email` bor, `phone` yo'q — ular muddati tugaguncha
  ishlaydi, lekin frontend ularni `refresh` qilib yangilashi kerak. Eng toza
  yo'l: deploydan keyin `localStorage` dagi tokenlarni bir marta tozalab,
  foydalanuvchini qayta kiritish.

---

## 8. Frontend checklist

**Client:**
- [ ] OTP, resend-code, forgot/reset-password sahifalarini o'chirish
- [ ] Register formasi: faqat **ism + telefon** (parol, email yo'q)
- [ ] Register javobidagi tokenlarni saqlab, **darhol** foydalanuvchini ichkariga kiritish
- [ ] Login formasi: **telefon + ism**
- [ ] `409` → login'ga urinish, `401` → "telefon yoki ism noto'g'ri", `429` → "keyinroq urining"
- [ ] `user.email`, `user.is_verified` ishlatilgan joylarni olib tashlash
- [ ] Profil: ism/telefon o'zgarsa login ma'lumoti o'zgarishi haqida ogohlantirish
- [ ] Checkout: ism/telefonni profildan oldindan to'ldirish
- [ ] Narxlarni butun so'm sifatida formatlash (`1 250 000 so'm`)

**Admin:**
- [ ] Login: **telefon + parol**
- [ ] Foydalanuvchilar jadvali/qidiruv/saralash: email → phone
- [ ] `verified_users` statistikani olib tashlash
- [ ] Mahsulot formasi: narx maydonlari faqat butun son
- [ ] "Parolni o'zgartirish" — faqat admin profilida
