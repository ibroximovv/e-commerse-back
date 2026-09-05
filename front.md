# Frontend / Admin panel uchun o'zgarishlar

Backend katalogga (OCO «Каталог 2026-III») moslashtirildi. Quyidagilar **buzuvchi
o'zgarishlar** — frontendni yangilamasdan eski kod ishlamaydi.

Qisqacha uchta narsa o'zgardi:

1. **Ko'p tillilik** — `name` va `description` endi bazada uch tilda saqlanadi;
   o'qishda bitta satr qaytadi, yozishda `{uz, ru, en}` obyekti yuboriladi.
2. **Kategoriya daraxti yo'q** — katalog tekis, 8 ta bo'lim. `parent_id`,
   `/tree`, `breadcrumbs` olib tashlandi.
3. **To'lov** — soxta "darhol to'landi" o'rniga haqiqiy Payme kassasi.

---

## 1. Javob formati

Har bir javobga `language` maydoni qo'shildi — javob qaysi tilda qaytganini
bildiradi (keshlash uchun ishlating).

```json
{
  "success": true,
  "data": { },
  "meta": { },
  "language": "uz"
}
```

`message` va `meta` — **qiymat bo'lmasa javobda umuman bo'lmaydi** (`null` emas,
kalitning o'zi yo'q). `res.meta?.total` kabi ixtiyoriy kirish ishlating.

### Til qanday tanlanadi

Tartib: `?ln=<til>` → JWT ichidagi `user.language` → `uz`.

Qo'llab-quvvatlanadi: `uz`, `ru`, `en`. Notanish qiymat `uz` ga tushadi.

```
GET /api/products?ln=ru
GET /api/products            # tokendagi til, bo'lmasa uz
```

> **Muhim:** ilgari til almashtirilganda ruscha matnlar o'zgarmasdi. Sabab —
> tarjima lug'at orqali qilinardi va bazadagi ruscha matn lug'atda yo'q edi.
> Endi tarjima bazadan keladi, shuning uchun `?ln` haqiqatan ishlaydi.

### Admin uchun: `?raw=true`

Oddiy so'rovda **bitta til** qaytadi. Tahrirlash formasida uchala til kerak —
`?raw=true` qo'shing:

```
GET /api/products/:id?raw=true
```

| So'rov | `name` maydoni |
|---|---|
| `GET /api/products/:id?ln=ru` | `"Автоматический насос 1WZB-250"` |
| `GET /api/products/:id?ln=uz` | `"Avtomatik nasos 1WZB-250"` |
| `GET /api/products/:id?raw=true` | yo'q — o'rniga `name_uz`, `name_ru`, `name_en` |

**Admin panel qoidasi:** ro'yxatlarda `?raw` ishlatmang (bitta til qulayroq),
tahrirlash formasini ochganda `?raw=true` bilan oling.

---

## 2. Ko'p tilli maydonlar

### O'qish (`?raw` siz)

```json
{
  "id": "…",
  "name": "Avtomatik suv nasosi 1WZB-250 (alyuminiy)",
  "description": "Bosim avtomatikasi o'rnatilgan avtomatik suv nasosi.",
  "attributes": [
    { "key": "Quvvat", "value": "250", "unit": "Vt" },
    { "key": "Material", "value": "Alyuminiy", "unit": null }
  ]
}
```

### O'qish (`?raw=true`)

```json
{
  "id": "…",
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

### Yozish (POST / PATCH)

`name` va `description` — **obyekt**, satr emas:

```json
{
  "name": {
    "uz": "Avtomatik suv nasosi 1WZB-250",
    "ru": "Автоматический водяной насос 1WZB-250",
    "en": "Automatic water pump 1WZB-250"
  },
  "description": { "uz": "…", "ru": "…", "en": "…" }
}
```

Qoidalar:

- `name` uchun **kamida bitta til** to'ldirilishi shart. Bo'sh qolgan tillar
  to'ldirilganidan nusxalanadi — mahsulot hech qachon nomsiz qolmaydi.
- `description` butunlay ixtiyoriy.
- `PATCH` da **yuborilmagan til o'zgarishsiz qoladi**. Faqat ruschani
  o'zgartirmoqchi bo'lsangiz `{"name": {"ru": "yangi"}}` yuboring — `uz` va `en`
  tegilmaydi.
- Bo'sh satr (`""`) yuborish tilni tozalamaydi, u "to'ldirilmagan" deb hisoblanadi.

### Fallback

So'ralgan tilda matn bo'lmasa: **so'ralgan til → uz → ru → en**. Ya'ni faqat
ruschasi kiritilgan mahsulot o'zbekcha interfeysda ham ruscha ko'rinadi
(bo'sh emas). Admin panelda "tarjima qilinmagan" belgisini shu asosda
ko'rsatishingiz mumkin (`?raw=true` da qaysi til bo'sh ekanini ko'rasiz).

---

## 3. Kategoriyalar

### Olib tashlandi

| Nima | Sabab |
|---|---|
| `parent_id` maydoni | Katalog tekis — ichki kategoriya yo'q |
| `GET /api/categories/tree` | O'rniga `GET /api/categories/all` |
| `GET /api/categories/:id/breadcrumbs` | Zanjir yo'q |
| `children` massivi (javobda) | — |
| `?root_only=`, `?parent_id=` filtrlari | — |
| Javobdagi `breadcrumbs` | — |

### Endpointlar

```
GET    /api/categories                  # sahifalangan ro'yxat
GET    /api/categories/all              # menyu uchun hammasi (sahifalashsiz)
GET    /api/categories/slug/:slug
GET    /api/categories/:id
POST   /api/categories                  # ADMIN
PATCH  /api/categories/:id              # ADMIN
DELETE /api/categories/:id              # ADMIN
```

`GET /api/categories` filtrlari: `?search=`, `?is_featured=`,
`?with_product_count=`, `?include_archived=` (ADMIN), `?page=`, `?limit=`,
`?sortBy=sort_order|name|created_at|updated_at`, `?sortOrder=asc|desc`.

> `sortBy=name` — saralash **joriy til** ustunida bo'ladi, ya'ni o'zbekcha
> interfeysda o'zbekcha alifbo tartibida.

### Menyu (avvalgi daraxt o'rniga)

```
GET /api/categories/all?with_product_count=true
```

```json
{
  "success": true,
  "language": "uz",
  "data": [
    { "id": "…", "name": "Avtomatik nasoslar", "slug": "avtomaticheskie-nasosy",
      "sort_order": 1, "is_featured": true, "image": null, "icon": null,
      "product_count": 14 }
  ]
}
```

Massiv `sort_order` bo'yicha tartiblangan — rekursiv render qilish shart emas,
oddiy `map` yetarli.

### Kategoriya yaratish

```http
POST /api/categories
```
```json
{
  "name": { "uz": "Asboblar", "ru": "Инструменты", "en": "Tools" },
  "description": { "uz": "…", "ru": "…", "en": "…" },
  "sort_order": 7,
  "is_featured": false,
  "image": "uploads/tools.png",
  "icon": "uploads/icons/tools.svg"
}
```

`slug` yuborilmasa nomdan avtomatik hosil bo'ladi (kirill translit qilinadi).
Slug **barcha tillar uchun bitta** — til almashganda URL o'zgarmaydi.

Nom unikalligi **har bir tilda alohida** tekshiriladi → takrorlansa `409`.

### O'chirish

Mahsuloti bor kategoriya o'chirilmaydi (`400`) — `PATCH` bilan
`is_archived: true` qiling. Arxivlansa **ichidagi mahsulotlar ham** arxivlanadi
(tiklansa qaytariladi).

---

## 4. Mahsulotlar

### Endpointlar (o'zgarmagan)

```
GET    /api/products                 # qidiruv + filtr
GET    /api/products/filters         # faset (filtr paneli)
GET    /api/products/top
GET    /api/products/best-sellers
GET    /api/products/featured
GET    /api/products/new-arrivals
GET    /api/products/discounted
GET    /api/products/top-rated
GET    /api/products/slug/:slug
GET    /api/products/:id
GET    /api/products/:id/related
POST   /api/products                 # ADMIN
PATCH  /api/products/:id             # ADMIN
PATCH  /api/products/:id/flags       # ADMIN
PATCH  /api/products/:id/stock       # ADMIN
PATCH  /api/products/bulk/archive    # ADMIN
DELETE /api/products/:id             # ADMIN
```

### Filtrdagi o'zgarish

| O'zgarish | Izoh |
|---|---|
| `?include_descendants` **olib tashlandi** | Ichki kategoriya yo'q |
| `?search=` endi **uchala tilda** qidiradi | Ruscha so'rov o'zbekcha interfeysda ham topadi |
| `?sort=name_asc` / `name_desc` joriy tilda saralaydi | — |
| `?attributes=` qiymatlari o'zgardi | Pastda ko'ring |

Qolganlari o'zgarmagan: `category_id`, `category_ids`, `category_slug`,
`min_price`, `max_price`, `price_on_request`, `has_discount`,
`min_discount_percent`, `brands`, `tags`, `stock_status`, `in_stock`,
`min_rating`, `is_top`, `is_featured`, `new_within_days`, `sort`,
`with_facets`, `include_archived`, `page`, `limit`.

### Fasetlar (`?with_facets=true` yoki `/filters`)

Atribut fasetining shakli o'zgardi — endi **identifikator** va **yorliq**
ajratilgan:

```json
{
  "price": { "min": 0, "max": 0 },
  "categories": [ { "id": "…", "name": "Avtomatik nasoslar", "slug": "…", "count": 14 } ],
  "brands":     [ { "value": "OCO", "count": 54 } ],
  "attributes": [
    {
      "key":   "Power",          // ⬅ FILTRDA SHUNI YUBORING (o'zgarmas)
      "label": "Quvvat",         // ⬅ FOYDALANUVCHIGA SHUNI KO'RSATING
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

Filtrga **`key` va `value`** ni yuboring (`label` ni emas):

```
GET /api/products?attributes=Power:250,Power:370,Material:Copper
```

`key`/`value` tilga bog'liq emas — foydalanuvchi tilni almashtirsa tanlangan
filtrlar saqlanib qoladi. `label` esa joriy tilda keladi.

> Bir kalitning bir nechta qiymati **YOKI**, turli kalitlar **VA** sifatida
> ishlaydi: yuqoridagi so'rov = (250 yoki 370) VA Copper.

### Mahsulot yaratish / tahrirlash

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
  "sku": "1WZB-250",
  "brand": "OCO",
  "tags": ["1wzb", "nasos"],
  "images": ["uploads/1wzb-250.png"],

  "price": 0,
  "price_on_request": true,
  "stock": 0,

  "attributes": [
    {
      "key":   { "uz": "Quvvat",     "ru": "Мощность", "en": "Power" },
      "value": { "uz": "250",        "ru": "250",      "en": "250" },
      "unit":  { "uz": "Vt",         "ru": "Вт",       "en": "W" }
    },
    {
      "key":   { "uz": "Material",   "ru": "Материал", "en": "Material" },
      "value": { "uz": "Alyuminiy",  "ru": "Алюминий", "en": "Aluminium" }
    }
  ],

  "ikpu_code": "08471001001000000",
  "package_code": "1501886",
  "vat_percent": 12,
  "units": 241092
}
```

**Atribut formasi uchun qoidalar:**

- `key`, `value` — majburiy, kamida bitta tilda. `unit` — ixtiyoriy.
- **Birlikni kalitga qo'shmang.** `key: "Мощность"` + `unit: "Вт"` to'g'ri;
  `key: "Мощность,W"` noto'g'ri — aks holda bitta xarakteristika bir nechta
  faset guruhiga bo'linib ketadi.
- Sonli qiymatlarni uchala tilda bir xil yozing (`"250"`). Faqat matnli
  qiymatlar tarjima qilinadi (`Медный` / `Mis` / `Copper`).
- `attributes` **butunlay almashtiriladi** — `PATCH` da to'liq massiv yuboring,
  bitta elementni emas.

**Narx maydonlari:**

- `price_on_request: true` bo'lsa `price` yuborilmasa ham bo'ladi — u `0` bo'lib
  saqlanadi, chegirma o'chiriladi va mahsulot **savatga/buyurtmaga tushmaydi**.
- Formada `price_on_request` yoqilganda narx inputlarini bloklang.
- `discount_price` `price` dan kichik bo'lishi shart, aks holda `400`.

**Fiskalizatsiya maydonlari (yangi):**

| Maydon | Nima | Payme uchun | Bo'sh qolsa |
|---|---|---|---|
| `ikpu_code` | MXIK / IKPU — soliq tovar kodi (17 xonali) | **majburiy** | `.env` dagi zaxira |
| `vat_percent` | QQS foizi: `0` yoki `12` | **majburiy** | `.env` dagi zaxira |
| `package_code` | Qadoqlash kodi | ixtiyoriy | `.env` dagi zaxira |
| `units` | O'lchov birligi kodi (dona = `241092`) | ixtiyoriy | `.env` dagi zaxira |

Bular Payme chekini soliq organiga uzatish uchun kerak. Admin formada alohida
"Fiskalizatsiya" bo'limi qiling; kodlarni [tasnif.soliq.uz](https://tasnif.soliq.uz)
dan olasiz.

> **IKPU hech qayerda bo'lmasa to'lov ishlamaydi.** Mahsulotda ham, `.env` da ham
> bo'sh bo'lsa backend Payme'ga xato qaytaradi. Admin formada `ikpu_code` ni
> majburiy qiling yoki hech bo'lmasa ogohlantirish ko'rsating.
>
> `package_code` va `units` bo'sh bo'lsa chekka umuman qo'shilmaydi — bu to'g'ri
> xatti-harakat, `0` yuborish xato bo'lardi.

### Chek yig'indisi qoidasi

Payme talabi: **`to'lov summasi == Σ((price × count) − discount)`**. Backend buni
`CheckPerformTransaction` da tekshiradi va mos kelmasa to'lovni boshlatmaydi.

Chegirma mahsulot narxining o'ziga singdirilgan (buyurtmada yakuniy narx
saqlanadi), shuning uchun chek qatorlarida `discount` doim `0`. Agar kelajakda
**yetkazib berish narxi** qo'shilsa, u chekda **alohida qator** bo'lishi kerak —
o'z IKPU kodi bilan, aks holda tenglik buziladi va to'lov o'tmaydi.

### Mahsulot detali

`breadcrumbs` **olib tashlandi**. O'rniga `category` obyekti bor:

```json
{
  "id": "…",
  "name": "Avtomatik suv nasosi 1WZB-250 (alyuminiy)",
  "category": { "id": "…", "name": "Avtomatik nasoslar", "slug": "…" },
  "stock_status": "out_of_stock",
  "is_new": true
}
```

`stock_status`: `in_stock` | `low_stock` (≤5) | `out_of_stock`.

---

## 5. To'lov (Payme)

### Eski endpoint o'chirildi

```diff
- POST /api/payments                       { order_id, provider }
+ GET  /api/payments/checkout/:order_id    (tanasiz)
```

Eski `POST /api/payments` to'lovni **darhol muvaffaqiyatli** deb belgilardi —
hech qanday pul o'tmasdan buyurtma to'langan hisoblanardi. U olib tashlandi.

### Yangi oqim

```
1. POST /api/orders/checkout          → buyurtma yaratiladi (status: PENDING)
2. GET  /api/payments/checkout/:id    → checkout_url olinadi
3. window.location = checkout_url     → mijoz Payme kassasiga o'tadi
4. (Payme serveri backendga o'zi murojaat qiladi)
5. Mijoz PAYME_RETURN_URL ga qaytadi
6. GET /api/payments/status/:order_id → haqiqiy holatni tekshiring
```

> **6-qadam majburiy.** Mijozning qaytish sahifasiga tushishi to'lov o'tganini
> BILDIRMAYDI (u brauzerni yopishi, "orqaga" bosishi mumkin). To'lov faqat
> Payme backendga `PerformTransaction` yuborgach tasdiqlanadi. Muvaffaqiyat
> ekranini faqat `status` javobiga qarab ko'rsating.

### Havola olish

```http
GET /api/payments/checkout/<order_id>
Authorization: Bearer <token>
```

Tana yubormaysiz. `lang` ham yubormaysiz — kassa oynasining tili
foydalanuvchi profilidagi `language` dan olinadi.

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

`lang` ixtiyoriy — Payme kassasi oynasining tili. Yuborilmasa `?ln` yoki
tokendagi til ishlatiladi.

Mumkin bo'lgan xatolar:

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
  "success": true,
  "data": {
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
}
```

Holatlarni qanday ko'rsatish:

| `status` | `payme_state` | UI |
|---|---|---|
| `PENDING` | `CREATED` | "To'lov kutilmoqda" — spinner, qayta so'rang |
| `SUCCESSFUL` | `PERFORMED` | ✅ "To'lov muvaffaqiyatli" |
| `FAILED` | `CANCELLED` | ❌ "To'lov bekor qilindi" — qayta urinish tugmasi |
| `FAILED` | `CANCELLED_AFTER_PERFORM` | ↩️ "Pul qaytarildi" |
| `404` | — | Hali tranzaksiya boshlanmagan |

> Qaytish sahifasida `PENDING` bo'lsa bir necha soniya kutib qayta so'rang
> (masalan 2 soniyada bir, 30 soniyagacha) — Payme `PerformTransaction` ni
> yuborishi bir oz vaqt olishi mumkin.

### Admin — to'lovlar ro'yxati

```
GET /api/payments/admin/all?status=&provider=&search=&page=&limit=&sortOrder=
```

`search` — Payme tranzaksiya ID, buyurtma ID yoki provayder bo'yicha.
`?transaction_id` maydoni **`payme_transaction_id`** ga o'zgardi.

### Payme webhook (frontend TEGMAYDI)

`POST /api/payments/payme` — Payme serveri uchun. JWT yo'q, `Basic` kalit bilan
himoyalangan. Frontenddan hech qachon chaqirmang.

---

## 6. Savat va buyurtma

O'zgarmagan, lekin eslatma: `price_on_request: true` mahsulotni savatga
qo'shib ham, buyurtma qilib ham bo'lmaydi — `400` qaytadi.

Hozircha katalogdagi **54 mahsulotning hammasi** shunday (PDF'da narx yo'q).
Admin narx qo'ymaguncha savat ishlamaydi:

```http
PATCH /api/products/:id
{ "price": 1500000, "price_on_request": false, "stock": 10 }
```

Mahsulot kartochkasida `price_on_request` bo'lsa narx o'rniga
**"Narx kelishilgan holda"** va "So'rov yuborish" tugmasini ko'rsating.

---

## 7. Xatolar

Format o'zgarmagan, faqat `language` qo'shildi:

```json
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Chegirma narxi asosiy narxdan kichik bo'lishi kerak.",
  "path": "/api/products",
  "language": "uz",
  "timestamp": "2026-09-03T10:00:00.000Z"
}
```

`message` tanlangan tilga tarjima qilinadi. Validatsiya xatolarida u **massiv**
bo'lishi mumkin — ikkalasini ham qo'llab-quvvatlang.

---

## 8. Migratsiya cheklisti

**Umumiy**
- [ ] Til almashtirgichni `?ln=uz|ru|en` ga ulang
- [ ] Javobdagi `language` ni kesh kalitiga qo'shing

**Kategoriya**
- [ ] `/tree` → `/all` ga o'tkazing, rekursiv renderni oddiy ro'yxatga almashtiring
- [ ] `parent_id` inputini formadan olib tashlang
- [ ] Breadcrumb komponentini olib tashlang (yoki mahsulotdagi `category` dan quring)

**Mahsulot**
- [ ] Faset filtri `key`/`value` ni yuborsin, `label` ni ko'rsatsin
- [ ] `?include_descendants` ni so'rovlardan olib tashlang
- [ ] `price_on_request` uchun UI holati

**Admin formalar**
- [ ] Tahrirlash formasi `?raw=true` bilan yuklasin
- [ ] `name`/`description` uchun 3 tilli tab (uz / ru / en)
- [ ] Atribut redaktori: `key`/`value`/`unit` — har biri 3 tilli
- [ ] "Fiskalizatsiya" bo'limi: `ikpu_code`, `package_code`, `vat_percent`, `units`
- [ ] Tarjima qilinmagan tilni belgilash (`?raw=true` da bo'sh maydonlar)

**To'lov**
- [ ] `POST /api/payments` → `GET /api/payments/checkout/:order_id` (tanasiz)
- [ ] `checkout_url` ga redirect qiling
- [ ] Qaytish sahifasida `GET /api/payments/status/:order_id` bilan polling
- [ ] `payme_state` bo'yicha holat ekranlari
- [ ] Admin ro'yxatda `transaction_id` → `payme_transaction_id`

---

## 9. Swagger

To'liq va yangilangan sxema: `http://localhost:3000/api/docs`

Payme webhook (`/api/payments/payme`) u yerda **ko'rinmaydi** — u frontend uchun
emas, ataylab yashirilgan.
