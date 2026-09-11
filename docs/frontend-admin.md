# Admin panel uchun API qo'llanmasi

Bu hujjat **admin panel** (React/Vue) uchun. Xaridor ilovasi uchun alohida
hujjat bor: [frontend-client.md](./frontend-client.md).

- **Base URL:** `http://localhost:3000` (prod: `https://api.ocomarket.uz`)
- **Swagger:** `/api/docs`
- **Statik fayllar:** `/uploads/<fayl>`
- **CORS:** hamma origin uchun ochiq — Vite (`localhost:5173`) dan to'g'ridan-to'g'ri ishlaydi

---

## 0. Eng muhim o'zgarishlar (qisqacha)

| Nima | Eski | Yangi |
|---|---|---|
| **Ko'p tillilik** | `name` bitta satr | yozishda `{uz, ru, en}` obyekt, o'qishda bitta satr yoki `?raw=true` bilan hammasi |
| **Tahrirlash formasi** | oddiy `GET` | `GET /api/products/:id?raw=true` — 3 tilni ham qaytaradi |
| **Kategoriya daraxti** | `parent_id`, `/tree`, breadcrumbs | tekis ro'yxat, hammasi olib tashlangan |
| **Atributlar** | `{key, value}` | `{key, value, unit}` — har biri 3 tilli |
| **Narx** | majburiy | `price_on_request: true` — kelishiladigan narx |
| **Fiskalizatsiya** | `.env` dagi `PAYME_DEFAULT_*` | **`Category` da** `ikpu_code`/`package_code`/`vat_percent`/`units`, `Product` da esa override |
| **`package_code`** | ixtiyoriy edi | **majburiy** — bo'sh bo'lsa to'lov `-31008` bilan to'xtaydi |
| **To'lov** | `POST /api/payments` | `GET /api/payments/checkout/:order_id` |
| **To'lov ID** | `transaction_id` | `payme_transaction_id` |
| **SKU** | erkin | trim + UPPERCASE, takrorlansa `409` |

> `.env` dagi `PAYME_DEFAULT_*` zaxirasi **butunlay olib tashlandi**. Sabab:
> bitta kod butun katalogga qo'llanardi, ya'ni stabilizator ham "nasos" deb
> fiskallashardi. Endi kod bazada, kategoriya darajasida.

---

## 1. Javob formati

```json
{ "success": true, "data": {}, "meta": {}, "language": "uz" }
```

- `message` va `meta` — **qiymat bo'lmasa kalitning o'zi yo'q** (`null` emas).
- `language` — javob qaysi tilda qaytgani.
- `password` maydoni javoblardan **global** olib tashlanadi.

Sahifalangan ro'yxat `meta` si:

```json
{
  "total": 54, "page": 1, "limit": 10, "totalPages": 6,
  "hasNextPage": true, "hasPreviousPage": false, "sort": "relevance"
}
```

Xato:

```json
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Chegirma narxi asosiy narxdan kichik bo'lishi kerak.",
  "path": "/api/products",
  "language": "uz",
  "timestamp": "2026-09-11T10:00:00.000Z"
}
```

Validatsiya xatosida `message` — **massiv**. Formada maydonlar bo'yicha
ko'rsatish uchun ikkalasini ham qo'llab-quvvatlang.

---

## 2. `?ln` va `?raw=true`

Til tartibi: `?ln=<til>` → JWT dagi `user.language` → `uz`.

| So'rov | `name` maydoni |
|---|---|
| `GET /api/products/:id?ln=ru` | `"Автоматический насос 1WZB-250"` |
| `GET /api/products/:id?ln=uz` | `"Avtomatik nasos 1WZB-250"` |
| `GET /api/products/:id?raw=true` | `name` yo'q — o'rniga `name_uz`, `name_ru`, `name_en` |

**Admin panel qoidasi:**

- **Ro'yxatlarda** `?raw` ishlatmang — bitta til qulayroq.
- **Tahrirlash formasini** ochganda `?raw=true` bilan oling — 3 tilli tab kerak.

`?raw=true` javobi:

```json
{
  "name_uz": "Avtomatik suv nasosi 1WZB-250 (alyuminiy)",
  "name_ru": "Автоматический водяной насос 1WZB-250 (алюминий)",
  "name_en": "Automatic water pump 1WZB-250 (aluminium)",
  "description_uz": "…", "description_ru": "…", "description_en": "…",
  "attributes": [
    {
      "key_uz": "Quvvat",  "key_ru": "Мощность", "key_en": "Power",
      "value_uz": "250",   "value_ru": "250",    "value_en": "250",
      "unit_uz": "Vt",     "unit_ru": "Вт",      "unit_en": "W"
    }
  ]
}
```

Bo'sh tilni ko'rsatib "tarjima qilinmagan" belgisini chiqarishingiz mumkin.

### Yozish qoidalari

`name`, `description`, atributlarning `key`/`value`/`unit` — **obyekt**, satr emas:

```json
{ "name": { "uz": "…", "ru": "…", "en": "…" } }
```

- `name` uchun **kamida bitta til** shart (`400` aks holda). Bo'sh tillar
  to'ldirilganidan nusxalanadi — mahsulot hech qachon nomsiz qolmaydi.
- `description` butunlay ixtiyoriy.
- `PATCH` da **yuborilmagan til o'zgarishsiz qoladi**. Faqat ruschani
  o'zgartirish: `{"name": {"ru": "yangi"}}` — `uz` va `en` tegilmaydi.
- Bo'sh satr (`""`) tilni tozalamaydi, "to'ldirilmagan" deb hisoblanadi.

---

## 3. Autentifikatsiya va rollar

```
POST /api/auth/login    { email, password }  → { user, access_token, refresh_token }
POST /api/auth/refresh  { refresh_token }
```

Barcha admin so'rovlarida: `Authorization: Bearer <access_token>`.

- Rollar: `ADMIN` | `USER`. Admin endpointlar `JwtAuthGuard` + `RolesGuard`
  bilan himoyalangan — `USER` token bilan `403`.
- Login qilishdan oldin `is_verified: true` bo'lishi shart, aks holda `403`.
- Admin hisobi faqat seed orqali yaratiladi: `npx prisma db seed`.
- Tokenlar **stateless** — `logout` serverda hech nima o'chirmaydi.

`ProtectedRoute` da `user.role === 'ADMIN'` tekshiring, aks holda backend
`403` qaytaradi va sahifa bo'sh ko'rinadi.

---

## 4. Dashboard

```
GET /api/dashboard/stats     # ADMIN
```

```json
{
  "revenue": { "total_revenue": 0, "paid_revenue": 0 },
  "orders": {
    "total": 0, "pending": 0, "confirmed": 0,
    "shipped": 0, "delivered": 0, "cancelled": 0
  },
  "products": {
    "total_active": 54, "archived": 0,
    "out_of_stock": 0, "low_stock": 0,
    "price_on_request": 54
  },
  "users": { "total_users": 3, "verified_users": 2 },
  "monthly_sales": [ { "month": "2026-04", "revenue": 0, "orders": 0 } ],
  "recent_orders": [ /* oxirgi 5 ta, user + items + payment bilan */ ],
  "top_products": [ /* eng ko'p sotilgan 5 ta */ ]
}
```

Diqqat:

- `total_revenue` — bekor qilinmagan **hamma** buyurtma summasi (to'lanmaganlar
  ham). `paid_revenue` — faqat `SUCCESSFUL` to'lovlar. Ikkalasini alohida
  ko'rsating.
- `products.out_of_stock` **narxi kelishiladigan tovarlarni sanamaydi** — ular
  ataylab `stock: 0`, "tugagan" emas. Ular `price_on_request` da alohida turadi.
- `monthly_sales` — doim oxirgi 6 oy, bo'sh oylar `0` bilan to'ldirilgan.

Foydalanuvchilar bo'yicha qo'shimcha:

```
GET /api/users/stats   → { total_users, verified_users, admins_count, regular_users }
```

---

## 5. Kategoriyalar

```
GET    /api/categories?…                    # sahifalangan
GET    /api/categories/all                  # hammasi (menyu/select uchun)
GET    /api/categories/slug/:slug
GET    /api/categories/:id                  # + product_count
POST   /api/categories                      # ADMIN
PATCH  /api/categories/:id                  # ADMIN
DELETE /api/categories/:id                  # ADMIN
```

Ro'yxat filtrlari: `?search=` (3 tilda), `?is_featured=`,
`?with_product_count=`, `?include_archived=` (**faqat ADMIN**), `?page=`,
`?limit=`, `?sortBy=sort_order|name|created_at|updated_at`, `?sortOrder=`.

### Olib tashlangan

`parent_id`, `GET /api/categories/tree`, `/:id/breadcrumbs`, `children`,
`breadcrumbs`, `?root_only=`, `?parent_id=`. Katalog tekis — 8 ta bo'lim.
Formadan `parent_id` selektini olib tashlang.

### Yaratish / tahrirlash

```http
POST /api/categories
```
```json
{
  "name": { "uz": "Asboblar", "ru": "Инструменты", "en": "Tools" },
  "description": { "uz": "…", "ru": "…", "en": "…" },
  "slug": "instrumenty",
  "image": "uploads/tools.png",
  "icon": "uploads/icons/tools.svg",
  "is_featured": false,
  "sort_order": 7,

  "ikpu_code": "08413001001003001",
  "package_code": "1485163",
  "vat_percent": 12,
  "units": 241092
}
```

- `slug` yuborilmasa nomdan avtomatik hosil bo'ladi (kirill translit qilinadi).
  Slug **barcha tillar uchun bitta** — til almashganda URL o'zgarmaydi.
  Format: faqat kichik lotin harflari, raqam va defis.
- Nom unikalligi **har bir tilda alohida** tekshiriladi → takrorlansa `409`.
- `sort_order` — kichik son yuqorida turadi.

### Arxivlash va o'chirish

- Mahsuloti bor kategoriyani **o'chirib bo'lmaydi** (`400`) — `PATCH` bilan
  `is_archived: true` qiling.
- Kategoriya arxivlansa **ichidagi barcha mahsulotlar ham** arxivlanadi;
  tiklansa qaytariladi. Formada bu haqda ogohlantirish ko'rsating.

---

## 6. Mahsulotlar

```
GET    /api/products?…                # ro'yxat + filtr (ADMIN uchun include_archived)
GET    /api/products/filters          # fasetlar
GET    /api/products/:id              # ?raw=true bilan tahrirlash uchun
GET    /api/products/slug/:slug
POST   /api/products                  # ADMIN
PATCH  /api/products/:id              # ADMIN
PATCH  /api/products/:id/flags        # ADMIN
PATCH  /api/products/:id/stock        # ADMIN
PATCH  /api/products/bulk/archive     # ADMIN
DELETE /api/products/:id              # ADMIN
```

Filtrlar client hujjatida to'liq sanab o'tilgan. Adminka uchun muhimi:
**`?include_archived=true`** — faqat ADMIN tokeni bilan ishlaydi, boshqa
holatda e'tiborsiz qoldiriladi.

### Yaratish

```http
POST /api/products
```
```json
{
  "name": {
    "uz": "Avtomatik suv nasosi 1WZB-250 (alyuminiy)",
    "ru": "Автоматический водяной насос 1WZB-250 (алюминий)",
    "en": "Automatic water pump 1WZB-250 (aluminium)"
  },
  "description": { "uz": "…", "ru": "…", "en": "…" },
  "category_id": "…",
  "slug": "avtomaticheskiy-nasos-1wzb-250-al",
  "sku": "1WZB-250-AL",
  "brand": "OCO",
  "tags": ["1wzb", "nasos"],
  "images": ["uploads/catalog/1wzb-250.jpg"],

  "price": 0,
  "price_on_request": true,
  "discount_price": null,
  "stock": 0,

  "is_top": false,
  "is_featured": false,

  "attributes": [
    {
      "key":   { "uz": "Quvvat",    "ru": "Мощность", "en": "Power" },
      "value": { "uz": "250",       "ru": "250",      "en": "250" },
      "unit":  { "uz": "Vt",        "ru": "Вт",       "en": "W" }
    },
    {
      "key":   { "uz": "Material",  "ru": "Материал", "en": "Material" },
      "value": { "uz": "Alyuminiy", "ru": "Алюминий", "en": "Aluminium" }
    }
  ],

  "ikpu_code": null,
  "package_code": null,
  "vat_percent": null,
  "units": null
}
```

### Atribut redaktori qoidalari

- `key` va `value` majburiy (kamida bitta tilda), `unit` ixtiyoriy.
- **Birlikni kalitga qo'shmang.** To'g'ri: `key: "Мощность"` + `unit: "Вт"`.
  Noto'g'ri: `key: "Мощность,W"` — aks holda bitta xarakteristika bir nechta
  faset guruhiga bo'linib ketadi va sonli saralash buziladi.
- Sonli qiymatlarni **uchala tilda bir xil** yozing (`"250"`). Faqat matnli
  qiymatlar tarjima qilinadi (`Медный` / `Mis` / `Copper`).
- `attributes` **butunlay almashtiriladi** — `PATCH` da to'liq massiv yuboring,
  bitta elementni emas.
- Fasetlar `_en` variantiga qarab guruhlanadi, shuning uchun inglizcha kalitni
  bir xil yozish muhim (`Power` hamma joyda `Power`).

### Narx maydonlari

| Maydon | Xatti-harakat |
|---|---|
| `price` | `price_on_request: true` bo'lsa yuborilmasa ham bo'ladi |
| `price_on_request` | `true` → `price`/`final_price` majburan `0`, chegirma o'chiriladi, savat/buyurtma **bloklanadi** |
| `discount_price` | `price` dan kichik bo'lishi shart, aks holda `400`. Chegirmani bekor qilish: `null` |
| `final_price`, `discount_percent` | **hosil qilinadi** — yubormang, filtr va sortlash shular ustida ishlaydi |

Formada `price_on_request` yoqilganda narx inputlarini bloklang.

### SKU

- Yozishda **trim + UPPERCASE** qilinadi.
- Unikalligi **registrga bog'liq bo'lmagan holda** tekshiriladi → takrorlansa `409`.
- Bitta model ikki materialda sotilsa suffiks ishlating: `-AL`, `-CU`, `-BR`
  (masalan `QB-60-AL` / `QB-60-CU`).

### Bayroqlar, zaxira, ommaviy amallar

```http
PATCH /api/products/:id/flags     { "is_top": true, "is_featured": false, "is_archived": false }
PATCH /api/products/:id/stock     { "quantity": 25 }     # manfiy son ayiradi; natija < 0 → 400
PATCH /api/products/bulk/archive  { "ids": ["…","…"], "is_archived": true }
```

`bulk/archive` javobi: `{ "updated": 12 }`.

### O'chirish

`DELETE /api/products/:id` — buyurtmalar tarixi bilan bog'liq bo'lgani uchun
odatda **arxivlash afzal**. MongoDB tashqi kalitlarni majburlamaydi, ya'ni
o'chirilgan mahsulot buyurtma qatorlarini "bo'shliqqa" ishora qildirib qo'yadi.
Panelda o'chirish tugmasini ikkilamchi qiling, birlamchisi — arxivlash.

---

## 7. Fiskalizatsiya (IKPU) — Payme uchun majburiy

Bu eng muhim yangi bo'lim. **IKPU to'ldirilmasa to'lov ishlamaydi.**

### Qayerda saqlanadi

| Daraja | Maqsad |
|---|---|
| **`Category`** | asosiy joy — 8 ta kategoriyani to'ldirsangiz 54 ta mahsulot qamraladi |
| **`Product`** | faqat **istisno** uchun — kategoriyanikini qoplaydi |

Yechim tartibi: `Product → Category → xato`.

Istisno nima uchun kerak: bitta kategoriya ("Инструменты") ichida **ikki xil
tovar guruhi** bor — payvandlash apparati va elektrodvigatel. Ularning IKPU si
har xil, shuning uchun bittasiga mahsulot darajasida alohida kod beriladi.

### Maydonlar

| Maydon | Nima | Payme uchun | Bo'sh qolsa |
|---|---|---|---|
| `ikpu_code` | MXIK / IKPU — soliq tovar klassifikatori (17 xonali) | **MAJBURIY** | `-31008`, to'lov to'xtaydi |
| `package_code` | Qadoqlash kodi | **MAJBURIY** | `-31008`, to'lov to'xtaydi |
| `vat_percent` | QQS foizi: `0` yoki `12` | **MAJBURIY** | `-31008`, to'lov to'xtaydi |
| `units` | O'lchov birligi kodi (dona = `241092`) | ixtiyoriy | chekka umuman qo'shilmaydi |

Diqqat qilinadigan nozikliklar:

- **`vat_percent: 0` — haqiqiy qiymat** (QQS to'lovchisi emassiz), "bo'sh" emas.
  Backend `??` bilan yechadi, shuning uchun `0` kategoriyaga tushib ketmaydi.
  Formada `0` ni bo'shdan farqlang (checkbox emas, select: "0%" / "12%" / "belgilanmagan").
- **`package_code` hujjatda ixtiyoriy ko'rinadi, lekin amalda majburiy.**
  Yubormasak OFD chekni rad etadi:
  `-31222` / `-32035 "Невалидный тип поля: package_code"` — ya'ni maydonning
  yo'qligini ham noto'g'ri tur deb hisoblaydi.
- `units: 0` yuborish xato — mavjud bo'lmagan kod. Bo'sh qoldiring.
- `.env` dagi eski `PAYME_DEFAULT_*` zaxirasi **yo'q**. Endi kod topilmasa
  to'lov shunchaki to'xtaydi.

### Kodlarni qayerdan olish

- IKPU: [tasnif.soliq.uz](https://tasnif.soliq.uz) — **buxgalter tasdiqlashi shart**.
- `package_code`: `GET https://tasnif.soliq.uz/api/cls-api/mxik/get/package?mxikCode=<IKPU>`
  (masalan nasoslar uchun `08413001001003001` → `1485163`).

### Panelda nima qilish kerak

1. **Kategoriya formasida** alohida "Fiskalizatsiya" bo'limi — 4 ta maydon.
   Bu asosiy joy, bu yerni to'ldirish kerak.
2. **Mahsulot formasida** o'sha 4 ta maydon, lekin yig'ilgan (collapsed)
   "Fiskal kodni qoplash (ixtiyoriy)" bo'limida — placeholder sifatida
   kategoriyaning qiymatini ko'rsating.
3. Kategoriyada `ikpu_code`, `package_code` yoki `vat_percent` bo'sh bo'lsa
   ro'yxatda **qizil ogohlantirish** chiqaring: "Bu kategoriyadagi mahsulotlarni
   to'lab bo'lmaydi".
4. Server ishga tushganda ham fiskal ma'lumoti yo'q kategoriyalar haqida logga
   ogohlantirish yozadi.

### Chek yig'indisi qoidasi

Payme talabi: **`to'lov summasi == Σ((price × count) − discount)`**.
Backend buni `CheckPerformTransaction` da **oldindan** tekshiradi va mos
kelmasa to'lovni boshlatmaydi (`-31001`) — aks holda xato pul yechilgandan
keyin chiqardi.

Chegirma mahsulot narxining o'ziga singdirilgan (`price_at_purchase` allaqachon
yakuniy narx), shuning uchun chek qatorlarida `discount` doim `0`.

> Kelajakda **yetkazib berish narxi** qo'shilsa, u chekda **alohida qator**
> bo'lishi kerak — o'z IKPU kodi bilan, aks holda tenglik buziladi va to'lov
> o'tmaydi.

### Backend skriptlari (devops/admin uchun)

```bash
npm run db:check:ikpu          # qaysi mahsulot fiskallashmaydi — ro'yxat
npm run db:check:ikpu -- --all # hamma mahsulot
npm run db:set:ikpu -- --dry-run
npm run db:set:ikpu            # prisma/catalog/ikpu.json dan bazaga yozadi
```

`db:check:ikpu` kod topilmasa **non-zero** bilan chiqadi — CI da ishlatsa bo'ladi.
To'ldirish qo'llanmasi: `prisma/catalog/IKPU.md`.

---

## 8. Buyurtmalar

```
GET   /api/orders/admin/all?…     # ADMIN, sahifalangan
GET   /api/orders/:id             # ADMIN har qanday buyurtmani ko'radi
PATCH /api/orders/:id/status      # ADMIN
PATCH /api/orders/:id/cancel      # ADMIN har qanday holatda bekor qila oladi
```

Filtrlar: `?status=`, `?start_date=`, `?end_date=` (ISO), `?min_amount=`,
`?max_amount=`, `?search=`, `?page=`, `?limit=`, `?sortBy=`, `?sortOrder=`.

Javobda har bir buyurtma `user`, `items[].product` va `payment` bilan keladi.

### Statuslar

`PENDING` → `CONFIRMED` → `SHIPPED` → `DELIVERED`, yoki `CANCELLED`.

```http
PATCH /api/orders/:id/status
{ "status": "SHIPPED" }
```

Muhim:

- **`CONFIRMED` ni qo'lda qo'ymang.** Uni Payme `PerformTransaction` yuborganda
  backend o'zi qo'yadi. Qo'lda qo'yish to'lanmagan buyurtmani to'langan
  ko'rsatadi. Panelda `PENDING → CONFIRMED` o'tishini bloklang yoki
  "faqat naqd to'lov uchun" deb ogohlantiring.
- Buyurtma **bekor qilinganda zaxira qaytariladi** va `sales_count` kamayadi.
- `DELIVERED` buyurtmani Payme orqali **bekor qilib bo'lmaydi** (`-31007`) —
  ya'ni yetkazib berilgan deb belgilashdan oldin qaytarish siyosatini o'ylang.

---

## 9. To'lovlar

```
GET /api/payments/admin/all?…       # ADMIN, sahifalangan
GET /api/payments/status/:order_id  # ADMIN har qanday buyurtma uchun
```

Filtrlar: `?status=PENDING|SUCCESSFUL|FAILED|REFUNDED`, `?provider=`,
`?search=`, `?page=`, `?limit=`, `?sortOrder=` (default `desc`).

`search` — **Payme tranzaksiya ID**, buyurtma ID yoki provayder bo'yicha.

> `transaction_id` maydoni **`payme_transaction_id`** ga o'zgardi. Jadval
> ustunini va qidiruv inputini yangilang.

To'lov yozuvi:

```json
{
  "id": "…",
  "order_id": "…",
  "amount": 1500000,
  "provider": "payme",
  "status": "SUCCESSFUL",
  "error_message": null,
  "payme_transaction_id": "…",
  "payme_state": "PERFORMED",
  "payme_time": 1772000000000,
  "payme_create_time": 1772000000000,
  "payme_perform_time": 1772000060000,
  "payme_cancel_time": null,
  "payme_reason": null,
  "order": { "…": "…", "user": { "id": "…", "email": "…", "full_name": "…" } }
}
```

### `Payment` va `PaymeTransaction` farqi

Buni tushunmasangiz panel noto'g'ri ma'lumot ko'rsatadi:

- **`Payment`** — bitta buyurtmaga **bitta** yozuv (`order_id` unikal). U
  buyurtmaning **eng so'nggi** Payme urinishining nusxasi. Admin ro'yxat shu
  jadvaldan o'qiydi.
- **`PaymeTransaction`** — protokolning haqiqiy manbai. Payme **har urinish
  uchun yangi tranzaksiya** ochadi (kartada mablag' yetmasa mijoz qaytadan
  uriniadi), shuning uchun bitta buyurtmada bir nechta tranzaksiya bo'lishi
  normal.

Ya'ni: to'lovlar ro'yxatida bitta qator ko'rinsa ham, aslida 3 marta urinilgan
bo'lishi mumkin. Sverka (reconciliation) kerak bo'lsa `PaymeTransaction`
jadvalidan foydalanish kerak (hozircha alohida endpoint yo'q).

### Holatlar

| `status` | `payme_state` | Ma'nosi |
|---|---|---|
| `PENDING` | `CREATED` | tranzaksiya ochilgan, pul hali o'tmagan |
| `SUCCESSFUL` | `PERFORMED` | pul o'tdi, buyurtma `CONFIRMED` |
| `FAILED` | `CANCELLED` | to'lovsiz bekor qilindi |
| `REFUNDED` | `CANCELLED_AFTER_PERFORM` | pul qaytarildi |

**Qaytarish (refund) zaxirani tiklaydi:** `CANCELLED_AFTER_PERFORM` da buyurtma
bekor qilinadi, `stock` oshadi, `sales_count`/`popularity_score` kamayadi.
Payment `REFUNDED` bo'ladi (`FAILED` emas).

Tranzaksiya **12 soatdan** keyin eskiradi — Payme uni yakunlay olmaydi.

### Payme webhook

`POST /api/payments/payme` — Payme serverining JSON-RPC endpointi.
JWT yo'q, `Authorization: Basic base64("Paycom:<PAYME_KEY>")` bilan
himoyalangan, HTTP status **har doim 200**. Swagger'da ko'rinmaydi.
**Panel hech qachon chaqirmaydi.**

Xato kodlari (loglarni o'qishda foydali):

| Kod | Ma'nosi |
|---|---|
| `-31001` | Summa mos kelmadi (chek yig'indisi ≠ to'lov summasi) |
| `-31003` | Tranzaksiya topilmadi |
| `-31007` | Bekor qilib bo'lmaydi (buyurtma `DELIVERED`) |
| `-31008` | Amalni bajarib bo'lmaydi — **eng ko'p uchraydigani: IKPU/package_code/vat_percent yo'q** |
| `-31050` | Buyurtma topilmadi |
| `-31051` | Buyurtma boshqa tranzaksiyada band |
| `-31052` | Buyurtma allaqachon to'langan |
| `-32504` | Avtorizatsiya kaliti noto'g'ri |

---

## 10. Foydalanuvchilar

```
GET    /api/users?role=&search=&page=&limit=   # ADMIN
GET    /api/users/stats                        # ADMIN
GET    /api/users/:id                          # ADMIN
PATCH  /api/users/:id                          # ADMIN — {full_name, phone, photo, language}
PATCH  /api/users/:id/role                     # ADMIN — { "role": "ADMIN" | "USER" }
DELETE /api/users/:id                          # ADMIN
GET    /api/users/profile                      # o'z profili
PATCH  /api/users/profile                      # o'z profili
```

**Panelni qulflab qo'ymaslik uchun backend uchta narsani rad etadi:**

1. **oxirgi ADMIN** ni `USER` ga tushirish;
2. **oxirgi ADMIN** ni o'chirish;
3. adminning **o'z** rolini o'zgartirishi yoki o'zini o'chirishi.

Boshqa yo'l bilan admin yaratib bo'lmaydi (faqat seed), shuning uchun bu
cheklovlar qattiq. UI da o'z qatoringizdagi va yagona admin qatoridagi
tugmalarni oldindan bloklang — xato xabari `400`/`403` bilan keladi.

`password` hech qachon javobga tushmaydi.

---

## 11. Sharhlar (moderatsiya)

```
GET    /api/products/:productId/reviews?…    # ochiq
DELETE /api/reviews/:id                      # muallif yoki ADMIN
```

Admin har qanday sharhni o'chira oladi. O'chirilgandan keyin mahsulot reytingi
avtomatik qayta hisoblanadi. Sharh tahrirlash endpointi yo'q — foydalanuvchi
o'zi qayta yuborsa yangilanadi.

`is_verified_purchase: true` — foydalanuvchi mahsulotni haqiqatdan sotib olgan.

---

## 12. Fayl yuklash

```
POST   /api/upload            # multipart, maydon nomi: file
POST   /api/upload/multiple   # maydon nomi: files, max 10 ta
DELETE /api/upload?path=uploads/xxx.png
```

- JWT talab qilinadi.
- Faqat rasm: `jpg, jpeg, png, gif, webp, svg`. Har biri max **10 MB**.
- Javob: `{ "url": "uploads/1712345678-123.png" }` yoki `{ "urls": [...] }`.
- Qaytgan yo'lni **o'sha ko'rinishda** (`uploads/…`) mahsulot/kategoriya
  maydoniga yozing. Ko'rsatishda base URL qo'shing.
- `DELETE` faqat `uploads/` ichidagi fayllarni o'chiradi (directory traversal
  himoyasi bor).

> Mahsulot o'chirilganda uning rasmlari **avtomatik o'chmaydi** — kerak bo'lsa
> panel o'zi `DELETE /api/upload` ni chaqirsin.

---

## 13. TypeScript tiplari (asosiylari)

```ts
export type Lang = 'uz' | 'ru' | 'en';
export type LocalizedText = { uz?: string; ru?: string; en?: string };

export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
  meta?: PageMeta & Record<string, unknown>;
  language: Lang;
}

export interface PageMeta {
  total: number; page: number; limit: number; totalPages: number;
  hasNextPage?: boolean; hasPreviousPage?: boolean; sort?: string;
}

export interface FiscalFields {
  ikpu_code: string | null;
  package_code: string | null;
  vat_percent: number | null;
  units: number | null;
}

/** `?raw` SIZ o'qilgan mahsulot (ro'yxat va ko'rish uchun). */
export interface Product extends FiscalFields {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  sku: string | null;
  brand: string | null;
  tags: string[];
  images: string[];
  price: number;
  price_on_request: boolean;
  discount_price: number | null;
  final_price: number;
  discount_percent: number;
  stock: number;
  is_archived: boolean;
  is_top: boolean;
  is_featured: boolean;
  sales_count: number;
  view_count: number;
  rating: number;
  rating_count: number;
  attributes: { key: string; value: string; unit: string | null }[];
  category?: { id: string; slug: string; name: string };
  stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock';  // faqat detalda
  is_new?: boolean;                                          // faqat detalda
  created_at: string;
  updated_at: string;
}

/** `?raw=true` bilan o'qilgan — tahrirlash formasi uchun. */
export interface ProductRaw extends Omit<Product, 'name' | 'description' | 'attributes'> {
  name_uz: string; name_ru: string; name_en: string;
  description_uz: string | null;
  description_ru: string | null;
  description_en: string | null;
  attributes: {
    key_uz: string; key_ru: string; key_en: string;
    value_uz: string; value_ru: string; value_en: string;
    unit_uz: string | null; unit_ru: string | null; unit_en: string | null;
  }[];
}

/** POST / PATCH tanasi. */
export interface ProductInput extends Partial<FiscalFields> {
  name: LocalizedText;
  description?: LocalizedText;
  category_id: string;
  slug?: string;
  sku?: string;
  brand?: string;
  tags?: string[];
  images?: string[];
  price?: number;
  price_on_request?: boolean;
  discount_price?: number | null;
  stock?: number;
  is_top?: boolean;
  is_featured?: boolean;
  is_archived?: boolean;          // faqat PATCH da
  attributes?: {
    key: LocalizedText;
    value: LocalizedText;
    unit?: LocalizedText;
  }[];
}

export type OrderStatus =
  | 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';

export type PaymeState =
  | 'CREATED' | 'PERFORMED' | 'CANCELLED' | 'CANCELLED_AFTER_PERFORM';
```

---

## 14. Migratsiya cheklisti

**Umumiy**
- [ ] `message`/`meta` ixtiyoriy kirish bilan o'qiladi (`res.meta?.total`)
- [ ] Xato `message` massiv bo'lishi hisobga olindi
- [ ] Til almashtirgich `?ln` ga ulandi

**Formalar**
- [ ] Tahrirlash formasi `?raw=true` bilan yuklanadi
- [ ] `name`/`description` uchun 3 tilli tab (uz / ru / en)
- [ ] `PATCH` da faqat o'zgargan tillar yuboriladi
- [ ] Atribut redaktori: `key`/`value`/`unit`, har biri 3 tilli
- [ ] Tarjima qilinmagan til belgisi (`?raw=true` da bo'sh maydonlar)
- [ ] `price_on_request` yoqilganda narx inputlari bloklanadi

**Kategoriya**
- [ ] `parent_id` selekti olib tashlandi
- [ ] `/tree` → `/all`, rekursiv render olib tashlandi
- [ ] Arxivlash mahsulotlarga ta'sir qilishi haqida ogohlantirish

**Fiskalizatsiya**
- [ ] Kategoriya formasida "Fiskalizatsiya" bo'limi (4 maydon)
- [ ] Mahsulot formasida "qoplash" bo'limi + kategoriyaning qiymati placeholder
- [ ] `vat_percent` da `0` va "belgilanmagan" farqlanadi
- [ ] `ikpu_code`/`package_code`/`vat_percent` bo'sh kategoriyalar qizil belgilanadi

**Buyurtma / to'lov**
- [ ] `PENDING → CONFIRMED` qo'lda o'tkazish bloklandi (Payme qo'yadi)
- [ ] `transaction_id` → `payme_transaction_id` (ustun + qidiruv)
- [ ] `REFUNDED` holati jadvalga qo'shildi
- [ ] `payme_state` bo'yicha badge

**Foydalanuvchilar**
- [ ] O'z qatoridagi rol/o'chirish tugmalari bloklandi
- [ ] Yagona admin qatorida ham bloklandi

---

## 15. Bosma katalogni yuklash (devops)

```bash
npm run db:import:catalog -- --dry-run   # avval quruq yurgizing
npm run db:import:catalog                # 8 kategoriya, 54 mahsulot
npm run db:set:ikpu                      # IKPU kodlarini yozadi — importdan KEYIN
npm run db:check:ikpu                    # tekshirish
```

- Import **idempotent** — `sku`, keyin `slug` bo'yicha moslashtiradi va qayta
  yurgizilganda narx, zaxira, bayroq va sotuv statistikasini **o'zgartirmaydi**
  (`--reset-pricing` berilmasa).
- Mahsulot rasmlari `prisma/catalog/images/` dan `uploads/catalog/` ga
  ko'chiriladi — alohida yuklash shart emas.
- Katalogni tozalash: `npm run db:reset:catalog` (buyurtmalar bo'lsa
  `--with-orders` kerak). Foydalanuvchilar hech qachon o'chirilmaydi.
- **`db:set:ikpu` ni har `db:import:catalog` dan keyin yurgizing** — importer
  kategoriyalarni fiskal maydonlarsiz qayta yaratadi.
