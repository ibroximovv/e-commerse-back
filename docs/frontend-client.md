# Client (do'kon) frontend uchun API qo'llanmasi

Bu hujjat **xaridor ilovasi** uchun (web-do'kon, Next.js/React/Vue yoki mobil).
Admin panel uchun alohida hujjat bor: [frontend-admin.md](./frontend-admin.md).

- **Base URL:** `http://localhost:3000` (prod: `https://api.ocomarket.uz`)
- **Swagger:** `/api/docs`
- **Statik fayllar:** `/uploads/<fayl>` — bazadagi `images: ["uploads/x.png"]`
  qiymatiga base URL qo'shib ishlating
- **CORS:** hamma origin uchun ochiq (`app.enableCors()`)

---

## 0. Eng muhim o'zgarishlar (qisqacha)

Eski frontend kodini yangilamasangiz ishlamaydigan joylar:

| Nima o'zgardi | Eski | Yangi |
|---|---|---|
| **To'lov** | `POST /api/payments` (`{order_id, provider}`) — darhol "to'landi" | `GET /api/payments/checkout/:order_id` — faqat kassa havolasi qaytaradi |
| **To'lov tasdig'i** | so'rov javobiga ishonilardi | faqat `GET /api/payments/status/:order_id` |
| **Ko'p tillilik** | `name` bitta satr, tarjima lug'atdan | `name` bazada 3 tilda, `?ln=` bilan tanlanadi |
| **Kategoriya daraxti** | `parent_id`, `/tree`, `breadcrumbs` | tekis ro'yxat — `GET /api/categories/all` |
| **Atributlar** | `{key, value}` | `{key, value, unit}` |
| **Faset filtri** | `key` = ko'rinadigan nom | `key`/`value` = tilga bog'liq bo'lmagan ID, `label` = ko'rsatiladigan matn |
| **Javob konverti** | `message: null`, `meta: null` | qiymat bo'lmasa **kalitning o'zi yo'q** + yangi `language` maydoni |
| **`price_on_request`** | yo'q edi | narxi kelishiladigan tovarni savatga qo'shib bo'lmaydi |
| **`transaction_id`** | — | `payme_transaction_id` |

---

## 1. Javob formati

### Muvaffaqiyatli javob

```json
{
  "success": true,
  "data": { },
  "meta": { },
  "language": "uz"
}
```

- `message` va `meta` — **qiymat bo'lmasa javobda umuman bo'lmaydi** (`null` emas,
  kalit yo'q). `res.meta?.total` kabi ixtiyoriy kirish ishlating.
- `language` — javob qaysi tilda qaytgani. Kesh kalitiga qo'shing.

### Sahifalangan ro'yxat

```json
{
  "success": true,
  "language": "uz",
  "data": [ /* ... */ ],
  "meta": {
    "total": 54, "page": 1, "limit": 10, "totalPages": 6,
    "hasNextPage": true, "hasPreviousPage": false,
    "sort": "relevance"
  }
}
```

### Xato

```json
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Not enough stock available",
  "path": "/api/carts/items",
  "language": "uz",
  "timestamp": "2026-09-11T10:00:00.000Z"
}
```

`message` tanlangan tilga tarjima qilinadi va **validatsiya xatolarida massiv**
bo'lishi mumkin — ikkalasini ham qo'llab-quvvatlang:

```ts
const text = Array.isArray(err.message) ? err.message.join('\n') : err.message;
```

---

## 2. Til (`?ln`)

Qo'llab-quvvatlanadi: `uz`, `ru`, `en`. Default — `uz`.

Aniqlash tartibi: **`?ln=<til>` → JWT ichidagi `user.language` → `uz`**.
Notanish qiymat `uz` ga tushadi.

```
GET /api/products?ln=ru
GET /api/products            # tokendagi til, token bo'lmasa uz
```

Login qilgan foydalanuvchining tilini o'zgartirish:

```http
PATCH /api/users/profile
{ "language": "ru" }
```

Shundan keyin `?ln` yubormasangiz ham hamma javob ruscha keladi — va **Payme
kassa oynasi ham shu tilda ochiladi**.

### Fallback

So'ralgan tilda matn bo'lmasa: **so'ralgan til → uz → ru → en → `null`**.
Ya'ni faqat ruschasi kiritilgan mahsulot o'zbekcha interfeysda ham ruscha
ko'rinadi, bo'sh qolmaydi.

> `?raw=true` — faqat admin panel uchun (hamma tilni qaytaradi). Client ilovada
> ishlatmang.

---

## 3. Autentifikatsiya

> To'liq tavsif va migratsiya: [front-changes-phone-auth.md](./front-changes-phone-auth.md)

Barcha yo'llar: `POST /api/auth/...`. Email, parol va OTP **yo'q**.

| Endpoint | Tana | Javob |
|---|---|---|
| `register` | `{full_name, phone}` | `{user, access_token, refresh_token}` — darhol kirilgan |
| `login` | `{phone, full_name}` | `{user, access_token, refresh_token}` |
| `refresh` | `{refresh_token}` | `{access_token, refresh_token}` |
| `logout` | — (JWT) | `{message}` |

**Login / register javobi:**

```json
{
  "success": true,
  "language": "uz",
  "currency": "UZS",
  "data": {
    "user": {
      "id": "…", "full_name": "…", "phone": "+998901234567", "role": "USER",
      "photo": null, "language": "uz", "created_at": "…", "updated_at": "…"
    },
    "access_token": "eyJ…",
    "refresh_token": "eyJ…"
  }
}
```

Muhim jihatlar:

- Telefon istalgan ko'rinishda yuboriladi, server `+998XXXXXXXXX` ga keltiradi.
- Ism registr va ortiqcha bo'shliqlarsiz solishtiriladi.
- `register`: raqam band bo'lsa `409`. `login`: xato bo'lsa `401`,
  bitta raqamga 15 daqiqada 5 ta xatodan keyin `429`.
- Tokenlar **stateless**. `logout` serverda hech nima o'chirmaydi — tokenlarni
  o'zingiz o'chiring.

Barcha himoyalangan so'rovlarda: `Authorization: Bearer <access_token>`.
`401` kelsa → `refresh` → qayta urinib ko'ring → yana `401` bo'lsa login sahifasi.

---

## 4. Profil

```
GET   /api/users/profile     # JWT
PATCH /api/users/profile     # {full_name?, phone?, photo?, language?}
```

`language` faqat `uz|ru|en`. `photo` — `POST /api/upload` qaytargan yo'l.

> `GET /api/users`, `GET /api/users/:id`, `DELETE /api/users/:id` — **ADMIN
> uchun**, client ilovadan chaqirmang (`403`).

---

## 5. Kategoriyalar

Katalog **tekis** — 8 ta bo'lim, ichki kategoriya yo'q.

```
GET /api/categories             # sahifalangan ro'yxat
GET /api/categories/all         # menyu uchun hammasi (sahifalashsiz)
GET /api/categories/slug/:slug  # SEO havola
GET /api/categories/:id
```

### Olib tashlangan narsalar

`parent_id`, `GET /api/categories/tree`, `/:id/breadcrumbs`, javobdagi
`children` va `breadcrumbs`, `?root_only=`, `?parent_id=` — **hammasi yo'q**.
Rekursiv render kerak emas, oddiy `map` yetadi.

### Menyu

```
GET /api/categories/all?with_product_count=true
```

```json
{
  "success": true,
  "language": "uz",
  "data": [
    {
      "id": "…",
      "name": "Avtomatik nasoslar",
      "description": null,
      "slug": "avtomaticheskie-nasosy",
      "image": null,
      "icon": null,
      "is_featured": true,
      "sort_order": 1,
      "product_count": 14
    }
  ]
}
```

Massiv `sort_order` bo'yicha tartiblangan.

### `GET /api/categories` filtrlari

`?search=` (uchala tilda qidiradi), `?is_featured=`, `?with_product_count=`,
`?page=`, `?limit=`, `?sortBy=sort_order|name|created_at|updated_at`,
`?sortOrder=asc|desc`.

`sortBy=name` — saralash **joriy til** ustunida bo'ladi.

---

## 6. Mahsulotlar

```
GET /api/products                 # qidiruv + filtr + sahifalash
GET /api/products/filters         # filtr paneli uchun fasetlar
GET /api/products/top
GET /api/products/best-sellers
GET /api/products/featured
GET /api/products/new-arrivals
GET /api/products/discounted
GET /api/products/top-rated
GET /api/products/slug/:slug
GET /api/products/:id
GET /api/products/:id/related
```

Bosh sahifa bloklari (`top`, `featured`, ...) uchun query: `?limit=` (max 50),
`?category_id=`, `?category_slug=`. Qo'shimcha: `top` da `?only_manual=`,
`new-arrivals` da `?within_days=`.

### Ro'yxat filtrlari

| Param | Izoh |
|---|---|
| `search` | **uchala tilda** qidiradi — ruscha so'rov o'zbekcha UI da ham topadi |
| `category_id`, `category_ids`, `category_slug` | kategoriya |
| `min_price`, `max_price` | chegirma hisobga olingan `final_price` bo'yicha |
| `price_on_request` | `false` — faqat narxi borlar, `true` — faqat kelishiladiganlar |
| `has_discount`, `min_discount_percent` | aksiyalar |
| `brands`, `tags` | `?brands=OCO`, `?tags=nasos,1wzb` |
| `attributes` | `?attributes=Power:250,Material:Copper` (pastda batafsil) |
| `stock_status` | `in_stock` \| `low_stock` \| `out_of_stock` |
| `in_stock` | `stock_status=in_stock` bilan bir xil |
| `min_rating` | 1..5 |
| `is_top`, `is_featured` | bayroqlar |
| `new_within_days` | oxirgi N kunda qo'shilganlar |
| `sort` | pastdagi ro'yxat |
| `with_facets` | `meta.facets` ni qo'shadi |
| `page`, `limit` | sahifalash |

**`sort` qiymatlari:** `relevance` (default), `newest`, `oldest`, `price_asc`,
`price_desc`, `popular`, `top_rated`, `most_viewed`, `discount`, `name_asc`,
`name_desc`. `name_asc`/`name_desc` **joriy tilda** saralaydi.

> `?include_descendants` **olib tashlandi** — ichki kategoriya yo'q.
> `?include_archived` faqat ADMIN uchun ishlaydi, client so'rovida e'tiborsiz
> qoldiriladi.

### Mahsulot obyekti

```json
{
  "id": "…",
  "name": "Avtomatik suv nasosi 1WZB-250 (alyuminiy)",
  "description": "Bosim avtomatikasi o'rnatilgan avtomatik suv nasosi.",
  "slug": "avtomaticheskiy-vodyanoy-nasos-1wzb-250-al",
  "sku": "1WZB-250-AL",
  "brand": "OCO",
  "tags": ["nasos", "1wzb"],
  "images": ["uploads/catalog/1wzb-250.jpg"],

  "price": 0,
  "price_on_request": true,
  "discount_price": null,
  "final_price": 0,
  "discount_percent": 0,

  "stock": 0,
  "rating": 0,
  "rating_count": 0,
  "sales_count": 0,
  "view_count": 12,

  "attributes": [
    { "key": "Quvvat",   "value": "250",       "unit": "Vt" },
    { "key": "Material", "value": "Alyuminiy", "unit": null }
  ],

  "category": { "id": "…", "slug": "…", "name": "Avtomatik nasoslar" },
  "created_at": "…",
  "updated_at": "…"
}
```

`GET /api/products/:id` va `/slug/:slug` javobiga qo'shimcha ikkita maydon:

```json
{
  "stock_status": "out_of_stock",   // in_stock | low_stock (≤5) | out_of_stock
  "is_new": true
}
```

Mahsulot detali ochilganda `view_count` avtomatik oshadi (admin ochganda oshmaydi).

> `breadcrumbs` yo'q. Zanjir kerak bo'lsa `category` obyektidan quring:
> `Bosh sahifa / {category.name} / {name}`.

### Narx kelishiladigan tovarlar (`price_on_request`)

`price_on_request: true` bo'lsa:

- `price` va `final_price` — doim `0`, chegirma yo'q;
- mahsulotni **savatga qo'shib bo'lmaydi** va **buyurtma qilib bo'lmaydi** (`400`);
- `facets.price` oralig'iga kirmaydi.

UI da narx o'rniga **"Narx kelishilgan holda"** va "So'rov yuborish" tugmasini
ko'rsating, "Savatga" tugmasini bloklang.

> Hozircha katalogdagi **54 mahsulotning hammasi** shunday — bosma katalogda narx
> ko'rsatilmagan. Admin narx qo'ymaguncha savat oqimi ishlamaydi.

### Fasetlar (filtr paneli)

Ikki yo'l bilan olinadi:

```
GET /api/products/filters?<joriy filtrlar>   → data = fasetlar
GET /api/products?with_facets=true           → meta.facets = fasetlar
```

```json
{
  "price": { "min": 0, "max": 0 },
  "categories": [
    { "id": "…", "name": "Avtomatik nasoslar", "slug": "…", "count": 14 }
  ],
  "brands": [ { "value": "OCO", "count": 54 } ],
  "attributes": [
    {
      "key":   "Power",      // ⬅ FILTRDA SHUNI YUBORING (tilga bog'liq emas)
      "label": "Quvvat",     // ⬅ FOYDALANUVCHIGA SHUNI KO'RSATING
      "unit":  "Vt",
      "values": [
        { "value": "250", "label": "250", "count": 4 },
        { "value": "370", "label": "370", "count": 6 }
      ]
    }
  ],
  "counts": { "in_stock": 0, "discounted": 0, "rating_4_plus": 0 },
  "attributes_sampled": false
}
```

**Qoida:** filtrga `key` va `value` yuboriladi, foydalanuvchiga `label`
ko'rsatiladi. `key`/`value` inglizcha variantdan olinadi va til almashganda
o'zgarmaydi — shuning uchun foydalanuvchi tilni almashtirsa tanlangan filtrlar
saqlanib qoladi.

```
GET /api/products?attributes=Power:250,Power:370,Material:Copper
```

Bir kalitning bir nechta qiymati — **YOKI**, turli kalitlar — **VA**.
Yuqoridagi so'rov = `(250 yoki 370) VA Copper`.

`attributes_sampled: true` bo'lsa fasetlar butun katalog emas, birinchi N
mahsulot bo'yicha hisoblangan (juda katta katalogda) — UI da "taxminiy" deb
belgilashingiz mumkin.

---

## 7. Sharhlar (reviews)

```
GET    /api/products/:productId/reviews          # ochiq
GET    /api/products/:productId/reviews/summary  # ochiq
POST   /api/products/:productId/reviews          # JWT
DELETE /api/reviews/:id                          # JWT (muallif yoki admin)
```

Ro'yxat query: `?rating=1..5`, `?verified_only=true`,
`?sort=newest|oldest|rating_desc|rating_asc`, `?page=`, `?limit=`.

Javobda `meta.summary` — reyting diagrammasi uchun:

```json
{
  "meta": {
    "total": 12, "page": 1, "limit": 10, "totalPages": 2,
    "hasNextPage": true, "hasPreviousPage": false,
    "summary": {
      "average": 4.42,
      "count": 12,
      "distribution": { "1": 0, "2": 1, "3": 1, "4": 3, "5": 7 }
    }
  }
}
```

Sharh qoldirish:

```http
POST /api/products/:productId/reviews
{ "rating": 5, "comment": "Juda sifatli mahsulot." }
```

- Bir foydalanuvchi bir mahsulotga **bitta** sharh qoldiradi — qayta yuborilsa
  eskisi **yangilanadi** (yangi yozuv yaratilmaydi). UI da "tahrirlash" holatini
  ko'rsating.
- Foydalanuvchi shu mahsulotni sotib olgan bo'lsa `is_verified_purchase: true`
  avtomatik qo'yiladi — kartochkada "Tasdiqlangan xarid" belgisi.
- `rating` 1..5 (butun son), `comment` ixtiyoriy, maksimal 2000 belgi.
- Sharh qo'shilgach mahsulotning `rating`/`rating_count` va TOP reytingi darhol
  qayta hisoblanadi.

---

## 8. Savat

Hammasi JWT talab qiladi.

```
GET    /api/carts
POST   /api/carts/items                  { product_id, quantity? }
PATCH  /api/carts/items/:product_id      { quantity }
DELETE /api/carts/items/:product_id
DELETE /api/carts                        # butun savatni tozalash
```

**Har bir metod to'liq savatni qaytaradi** — javobni to'g'ridan-to'g'ri state ga
yozing, qayta `GET` qilish shart emas.

```json
{
  "id": "…",
  "user_id": "…",
  "items": [
    {
      "id": "…",
      "product_id": "…",
      "quantity": 2,
      "product": { /* to'liq mahsulot obyekti */ }
    }
  ],
  "totals": {
    "items_count": 2,
    "subtotal": 3000000,
    "original_total": 3400000,
    "discount_total": 400000
  }
}
```

`totals` **backendda** `final_price` bo'yicha hisoblanadi — frontendda qayta
hisoblamang, aks holda checkout summasi bilan farq qiladi.

Xatolar:

| Holat | Javob |
|---|---|
| Mahsulot topilmadi | `404` |
| Arxivlangan mahsulot | `400 Product is archived…` |
| `price_on_request: true` | `400 Price for this product is available on request…` |
| Zaxira yetmaydi | `400 Not enough stock available` |
| `PATCH` da `quantity <= 0` | element **o'chiriladi** (xato emas) |

---

## 9. Buyurtmalar

```
POST  /api/orders/checkout        # savatdan buyurtma yaratadi
GET   /api/orders?archived=       # o'z buyurtmalari (sahifalashsiz massiv)
GET   /api/orders/:id
PATCH /api/orders/:id/cancel
PATCH /api/orders/:id/archive     # tarixdan yashirish
```

### Checkout

```http
POST /api/orders/checkout
{
  "shipping_address": "Toshkent, Amir Temur ko'chasi, 45",
  "customer_phone": "+998901234567",
  "customer_name": "Alisher",
  "notes": "Soat 18:00 dan keyin yetkazing",
  "payment_method": "PAYME"
}
```

Hamma maydon ixtiyoriy (tanasiz ham yuborsa bo'ladi). Nima bo'ladi:

1. Savat bo'sh bo'lsa → `400 Cart is empty`;
2. Har bir mahsulot tekshiriladi (arxiv, `price_on_request`, zaxira) → `400`;
3. Buyurtma `PENDING` holatida yaratiladi, narx `price_at_purchase` ga
   **muzlatiladi**;
4. Zaxira darhol kamayadi, `sales_count` oshadi;
5. Savat tozalanadi.

Javob — buyurtma obyekti (`items[].product` bilan). Buni `order_id` sifatida
saqlang, keyingi qadam to'lov.

### Buyurtma holatlari

`PENDING` → `CONFIRMED` → `SHIPPED` → `DELIVERED`, yoki `CANCELLED`.

- **`CONFIRMED` ni backend qo'yadi** — Payme pulni o'tkazgandan keyin. Frontend
  hech qachon statusni o'zgartirmaydi.
- Xaridor faqat **`PENDING`** buyurtmani bekor qila oladi (`403`/`400` aks holda).
  Bekor qilinganda zaxira qaytariladi.
- `PATCH /:id/status` — **faqat ADMIN**.

---

## 10. To'lov (Payme)

> Yagona provayder — **Payme**. `provider` yuborish kerak emas (javobda bor,
> lekin so'rovda qabul qilinmaydi).

### Eski endpoint o'chirilgan

```diff
- POST /api/payments                       { order_id, provider }
+ GET  /api/payments/checkout/:order_id    (tanasiz)
```

Eski `POST /api/payments` to'lovni **darhol muvaffaqiyatli** deb belgilardi —
hech qanday pul o'tmasdan buyurtma to'langan hisoblanardi. U butunlay olib
tashlangan.

### To'liq oqim

```
1. POST /api/orders/checkout           → buyurtma (status: PENDING)
2. GET  /api/payments/checkout/:id     → checkout_url
3. window.location = checkout_url      → mijoz Payme kassasiga o'tadi
4. (Payme SERVERI backendga o'zi murojaat qiladi — frontend bunga aralashmaydi)
5. Mijoz PAYME_RETURN_URL ga qaytadi
6. GET /api/payments/status/:order_id  → HAQIQIY holatni tekshiring
```

> **6-qadam majburiy.** Mijozning qaytish sahifasiga tushishi to'lov o'tganini
> **bildirmaydi** — u brauzerni yopishi yoki "orqaga" bosishi mumkin. To'lov
> faqat Payme backendga `PerformTransaction` yuborgach tasdiqlanadi.
> Muvaffaqiyat ekranini **faqat** `status` javobiga qarab ko'rsating.

### Havola olish

```http
GET /api/payments/checkout/<order_id>
Authorization: Bearer <token>
```

Tana **yubormaysiz**. `lang` ham yubormaysiz — kassa oynasining tili
foydalanuvchi profilidagi `language` dan olinadi (`PATCH /api/users/profile`
bilan o'zgartiriladi).

```json
{
  "success": true,
  "language": "uz",
  "data": {
    "order_id": "…",
    "provider": "payme",
    "amount": 1500000,
    "checkout_url": "https://test.paycom.uz/bT0wMDAwMD…"
  }
}
```

| Kod | Sabab |
|---|---|
| `404` | Buyurtma topilmadi yoki boshqa foydalanuvchiniki |
| `400` | Buyurtma `PENDING` emas |
| `400` | Buyurtma allaqachon to'langan |

### Holatni tekshirish

```http
GET /api/payments/status/:order_id
```

```json
{
  "id": "…",
  "order_id": "…",
  "amount": 1500000,
  "provider": "payme",
  "status": "SUCCESSFUL",
  "payme_state": "PERFORMED",
  "payme_transaction_id": "…",
  "payme_create_time": 1772000000000,
  "payme_perform_time": 1772000060000,
  "payme_cancel_time": null,
  "payme_reason": null
}
```

| `status` | `payme_state` | UI |
|---|---|---|
| `PENDING` | `CREATED` | "To'lov kutilmoqda" — spinner, qayta so'rang |
| `SUCCESSFUL` | `PERFORMED` | ✅ "To'lov muvaffaqiyatli" |
| `FAILED` | `CANCELLED` | ❌ "To'lov bekor qilindi" — qayta urinish tugmasi |
| `REFUNDED` | `CANCELLED_AFTER_PERFORM` | ↩️ "Pul qaytarildi" |
| `404` | — | Hali tranzaksiya boshlanmagan (mijoz kassada hech nima qilmagan) |

Qaytish sahifasidagi polling namunasi:

```ts
async function waitForPayment(orderId: string) {
  for (let i = 0; i < 15; i++) {            // ~30 soniya
    const res = await api.get(`/api/payments/status/${orderId}`)
                         .catch(() => null); // 404 = hali tranzaksiya yo'q
    const s = res?.data?.data;
    if (s?.status === 'SUCCESSFUL') return 'success';
    if (s?.status === 'FAILED' || s?.status === 'REFUNDED') return 'failed';
    await new Promise((r) => setTimeout(r, 2000));
  }
  return 'pending';   // "Tekshirilmoqda, biroz kuting" ekrani
}
```

### Qayta urinish

Karta rad etilsa mijoz **qaytadan** to'lashi mumkin: shunchaki
`GET /api/payments/checkout/:order_id` ni qayta chaqiring. Payme har urinish
uchun yangi tranzaksiya ochadi, buyurtma esa `PENDING` bo'lib qolgani uchun
havola ishlayveradi.

### Frontend TEGMAYDIGAN endpoint

`POST /api/payments/payme` — Payme serverining webhook'i (JSON-RPC).
JWT emas, `Basic` kalit bilan himoyalangan. Swagger'da ham ko'rinmaydi.
**Hech qachon frontenddan chaqirmang.**

---

## 11. Fayl yuklash

```
POST   /api/upload            # multipart, maydon nomi: file
POST   /api/upload/multiple   # maydon nomi: files (max 10 ta)
DELETE /api/upload?path=uploads/xxx.png
```

JWT talab qilinadi. Faqat rasm (`jpg, jpeg, png, gif, webp, svg`), har biri
maksimal **10 MB**. Javob: `{ url: "uploads/1712…-123.png" }` yoki `{ urls: [...] }`.

Client ilovada odatda faqat profil rasmi uchun kerak bo'ladi.

---

## 12. Migratsiya cheklisti

**Umumiy**
- [ ] `?ln=uz|ru|en` til almashtirgichga ulandi
- [ ] `res.language` kesh kalitiga qo'shildi
- [ ] `message`/`meta` ixtiyoriy kirish bilan o'qiladi (`res.meta?.total`)
- [ ] Xato `message` massiv bo'lishi hisobga olindi

**Katalog**
- [ ] `/api/categories/tree` → `/api/categories/all`, rekursiv render olib tashlandi
- [ ] Breadcrumb komponenti olib tashlandi (yoki `product.category` dan quriladi)
- [ ] `?include_descendants` so'rovlardan olib tashlandi
- [ ] Faset filtri `key`/`value` yuboradi, `label` ko'rsatadi
- [ ] Atribut ko'rsatishda `unit` qo'shildi (`250 Vt`)

**Savat / buyurtma**
- [ ] `price_on_request` uchun alohida UI holati ("Narx kelishilgan holda")
- [ ] `totals` backenddan olinadi, frontendda hisoblanmaydi
- [ ] Checkout xatolari (zaxira, arxiv, narx so'rov bo'yicha) ko'rsatiladi

**To'lov**
- [ ] `POST /api/payments` olib tashlandi
- [ ] `GET /api/payments/checkout/:order_id` (tanasiz) → `checkout_url` ga redirect
- [ ] Qaytish sahifasida `GET /api/payments/status/:order_id` polling
- [ ] `payme_state` bo'yicha 4 ta holat ekrani
- [ ] Qayta urinish tugmasi (checkout havolasini qayta olish)
