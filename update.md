# Backend Update — Katalog, Filtr va TOP mahsulotlar

**Sana:** 2026-08-16
**Kimga:** Frontend jamoasi
**Qamrov:** Kategoriyalar (ierarxiya), mahsulot filtri, TOP/aksiya bloklari, izoh-reyting

Barcha javoblar odatdagidek `ResponseInterceptor` orqali o'raladi:

```json
{ "success": true, "data": ..., "message": null, "meta": { ... } }
```

Til tanlash o'zgarmagan: `?ln=uz|ru|en` (default `uz`), yoki JWT ichidagi `language`.

---

## 1. Nima o'zgardi — qisqacha

| Mavzu | Avval | Endi |
|---|---|---|
| Kategoriya | Bir darajali tekis ro'yxat | Cheksiz ierarxiya (`parent_id`, `children`, `tree`, `breadcrumbs`) |
| Kategoriya URL | Faqat ID | `slug` qo'shildi (SEO), kirill → lotin avtomatik |
| Mahsulot filtri | `search`, `category_id`, `min/max_price` | + brend, teg, atribut, ombor holati, reyting, chegirma, ichki kategoriyalar |
| Sortlash | Ixtiyoriy `sortBy` (xavfli) | 11 ta tayyor preset (`sort=...`), oq ro'yxat bilan himoyalangan |
| Chegirma | Yo'q | `discount_price`, `final_price`, `discount_percent` |
| TOP mahsulot | Yo'q | `is_top` (qo'lda) + `popularity_score` (avtomatik) |
| Filtr paneli | Frontend qo'lda yig'ardi | Backend faset (`facets`) beradi |
| Reyting | Yo'q | Izohlar + yulduzlar taqsimoti |

---

## 2. ⚠️ Breaking changes

### 2.1. `GET /api/categories` endi sahifalangan

**Avval** — to'g'ridan-to'g'ri massiv qaytardi:

```json
{ "success": true, "data": [ {...}, {...} ] }
```

**Endi** — `meta` bilan sahifalangan:

```json
{ "success": true, "data": [ {...} ], "meta": { "total": 12, "page": 1, "limit": 10, "totalPages": 2 } }
```

> **Nima qilish kerak:** menyu/select uchun barcha kategoriya kerak bo'lsa `GET /api/categories/tree` ishlating (u sahifalanmaydi), yoki `?limit=100` bering.

### 2.2. `?all=true` → `?include_archived=true`

`all` hali ishlaydi (deprecated), lekin yangi kodda `include_archived` ishlating.
**Muhim:** ikkalasi ham endi **faqat ADMIN** uchun ishlaydi. Oddiy foydalanuvchi yuborsa e'tiborsiz qoldiriladi va arxivlangan mahsulotlar chiqmaydi.

> Bonus tuzatish: avval `?all=false` ham `true` deb o'qilardi (`Boolean('false') === true`). Endi to'g'ri o'qiladi.

### 2.3. Narx maydoni ikkiga bo'lindi

- `price` — asosiy (chegirmasiz) narx, chizib tashlab ko'rsatiladigan narx
- `final_price` — **haqiqiy to'lanadigan narx** (chegirma bo'lsa u, bo'lmasa `price`)
- `discount_percent` — chegirma foizi (0 bo'lsa chegirma yo'q)

> **Nima qilish kerak:** narx ko'rsatishda `final_price` ishlating. `discount_percent > 0` bo'lsa `price` ni chizib tashlangan holda yoniga qo'ying.
> Filtrdagi `min_price`/`max_price` ham `final_price` ustida ishlaydi — ya'ni chegirmali mahsulot chegirmali narxi bo'yicha topiladi.

### 2.4. `GET /api/products/:id` endi kengaytirilgan javob

Qo'shildi: `breadcrumbs`, `stock_status`, `is_new`. Eski maydonlar joyida qolgan.

### 2.5. `GET /api/carts` javobiga `totals` qo'shildi

```json
"totals": { "items_count": 2, "subtotal": 1799.98, "original_total": 1999.98, "discount_total": 200 }
```

> **Nima qilish kerak:** savat summasini frontendda hisoblamang — `totals.subtotal` checkout'dagi summa bilan aynan bir xil.

---

## 3. Yangi maydonlar

### Category

| Maydon | Tur | Izoh |
|---|---|---|
| `slug` | string | Unikal, URL uchun. Kirill/o'zbek harflari avtomatik translit qilinadi (`Умные часы` → `umnye-chasy`) |
| `parent_id` | string \| null | Ota kategoriya. `null` = ildiz |
| `children` | Category[] | Ichki kategoriyalar (tree/detail javoblarida) |
| `icon` | string \| null | Menyu ikonkasi |
| `is_featured` | boolean | Bosh sahifadagi "Mashhur kategoriyalar" bloki uchun |
| `sort_order` | number | Menyudagi tartib. Kichik son yuqorida |
| `product_count` | number | Faqat so'ralganda. Daraxtda **ichki kategoriyalar bilan birga** hisoblanadi |
| `breadcrumbs` | array | Faqat detail javobida |

### Product

| Maydon | Tur | Izoh |
|---|---|---|
| `slug` | string | Unikal, SEO URL |
| `sku` | string \| null | Ombor kodi, unikal |
| `brand` | string \| null | Brend — filtrlanadi |
| `tags` | string[] | Teglar — filtrlanadi va qidiruvga kiradi |
| `discount_price` | number \| null | Aksiya narxi. `null` = chegirma yo'q |
| `final_price` | number | **To'lanadigan narx** |
| `discount_percent` | number | 0–100 |
| `is_top` | boolean | Admin qo'lda belgilagan TOP |
| `is_featured` | boolean | "Tanlangan mahsulotlar" bloki |
| `sales_count` | number | Sotilgan dona (checkout'da avtomatik oshadi) |
| `view_count` | number | Ko'rishlar (detail ochilganda avtomatik oshadi) |
| `rating` | number | 0–5 o'rtacha baho |
| `rating_count` | number | Baholovchilar soni |
| `popularity_score` | number | Avtomatik reyting bali (pastda tushuntirilgan) |
| `stock_status` | `in_stock` \| `low_stock` \| `out_of_stock` | Faqat detail javobida. `low_stock` = 1–5 dona |
| `is_new` | boolean | Faqat detail javobida. Oxirgi 30 kunda qo'shilgan |

---

## 4. Kategoriyalar API

### `GET /api/categories/tree` — menyu uchun asosiy endpoint

Butun ierarxiyani **bitta so'rovda** qaytaradi (sahifalanmaydi).

| Query | Izoh |
|---|---|
| `with_product_count` | Har bir tugunga mahsulotlar soni. Ota kategoriya soni ichkilarni ham qamraydi |
| `root_id` | Berilsa faqat shu kategoriyaning quyi daraxti |
| `include_archived` | Faqat ADMIN |

```jsonc
// GET /api/categories/tree?with_product_count=true
"data": [
  {
    "id": "6c0d...", "name": "Electronics", "slug": "electronics",
    "sort_order": 1, "is_featured": true, "product_count": 7,
    "children": [
      { "name": "Smartphones", "slug": "smartphones", "product_count": 3, "children": [] },
      { "name": "Laptops",     "slug": "laptops",     "product_count": 2, "children": [] }
    ]
  }
]
```

### `GET /api/categories` — sahifalangan ro'yxat

`page`, `limit`, `search`, `sortBy` (`sort_order`|`name`|`created_at`|`updated_at`), `sortOrder`,
`parent_id`, `root_only`, `is_featured`, `with_product_count`, `include_archived` (ADMIN).

### `GET /api/categories/:id` va `GET /api/categories/slug/:slug`

Detail: `children`, `breadcrumbs`, `product_count`.

Kategoriya sahifasini qurish uchun ikkita so'rov:

```
GET /api/categories/slug/smartphones          → sarlavha, breadcrumbs, ichki kategoriyalar
GET /api/products?category_slug=smartphones&with_facets=true  → mahsulotlar + filtr paneli
```

### `GET /api/categories/:id/breadcrumbs`

Faqat zanjir: `[{ id, name, slug }, ...]`

### Admin

| Metod | Yo'l | Izoh |
|---|---|---|
| POST | `/api/categories` | `parent_id` bersangiz ichki kategoriya. `slug` bo'sh bo'lsa avtomatik |
| PATCH | `/api/categories/:id` | `is_archived` **butun quyi daraxtga va undagi mahsulotlarga** kaskad bo'ladi |
| DELETE | `/api/categories/:id` | Ichki kategoriyasi yoki mahsuloti bor bo'lsa **400** — arxivlash kerak |

Bloklanadigan holatlar (400 qaytaradi, xabar tarjima qilinadi):
- kategoriyani o'z ichki kategoriyasi ostiga ko'chirish (daraxtda sikl)
- kategoriyani o'ziga ota qilib belgilash
- arxivlangan kategoriyaga mahsulot qo'shish

---

## 5. Mahsulot filtri — `GET /api/products`

### 5.1. Kategoriya

| Query | Izoh |
|---|---|
| `category_id` | Bitta kategoriya |
| `category_ids` | Bir nechta: `?category_ids=id1,id2` yoki takrorlanuvchi param |
| `category_slug` | Slug orqali |
| `include_descendants` | **Default `true`** — ota kategoriya tanlansa ichkilaridagi mahsulotlar ham chiqadi. `false` qilsangiz faqat aynan shu kategoriya |

```
GET /api/products?category_slug=electronics
→ Smartphones, Laptops, Tablets, Headphones ichidagilarning hammasi (7 ta)
```

### 5.2. Narx va chegirma

| Query | Izoh |
|---|---|
| `min_price`, `max_price` | `final_price` ustida ishlaydi |
| `has_discount` | Faqat chegirmadagilar |
| `min_discount_percent` | Masalan `20` — kamida 20% chegirma |

### 5.3. Brend, teg, atribut

| Query | Misol | Izoh |
|---|---|---|
| `brands` | `?brands=Apple,Samsung` | Registrga befarq (`apple` ham topadi) |
| `tags` | `?tags=5g,gaming` | Kamida bittasi mos kelsa yetarli (OR) |
| `attributes` | `?attributes=Color:Black,Storage:256GB` | `kalit:qiymat` |

**Atribut mantiqi:** turli kalitlar **AND**, bitta kalitning qiymatlari **OR**.

```
?attributes=Color:Black,Color:White,Storage:256GB
→ (Color=Black YOKI Color=White) VA Storage=256GB
```

### 5.4. Holat

| Query | Qiymatlar |
|---|---|
| `stock_status` | `in_stock` \| `low_stock` (1–5 dona) \| `out_of_stock` |
| `in_stock` | `true` — `stock_status=in_stock` bilan bir xil |
| `min_rating` | 0–5, masalan `4` |
| `is_top` | `true` |
| `is_featured` | `true` |
| `new_within_days` | Masalan `30` |

### 5.5. Sortlash — `sort`

Endi baza maydoni emas, **preset** yuboriladi:

| `sort` | Nima bo'yicha |
|---|---|
| `relevance` | **Default.** TOP → reyting bali → yangilik |
| `newest` / `oldest` | Qo'shilgan sana |
| `price_asc` / `price_desc` | `final_price` |
| `popular` | Sotuvlar soni |
| `top_rated` | Reyting → baholovchilar soni |
| `most_viewed` | Ko'rishlar |
| `discount` | Chegirma foizi (katta → kichik) |
| `name_asc` / `name_desc` | Nom |

Ro'yxatdan tashqari qiymat yuborilsa **400** qaytadi (ruxsat etilganlar ro'yxati bilan).

> Eski `sortBy` + `sortOrder` hali ishlaydi, lekin faqat oq ro'yxatdagi maydonlar uchun. Ro'yxatda bo'lmagan maydon jimgina `relevance` ga tushadi. `meta.sort` **haqiqatda qo'llangan** tartibni ko'rsatadi.

### 5.6. Javob

```jsonc
"meta": {
  "total": 7, "page": 1, "limit": 10, "totalPages": 1,
  "hasNextPage": false, "hasPreviousPage": false,
  "sort": "price_asc"
}
```

`limit` maksimumi **100** (ortiq yuborilsa 100 ga qisqartiriladi).

---

## 6. Filtr paneli — fasetlar

Ikki xil olish mumkin:
- `GET /api/products?...&with_facets=true` → `meta.facets` ichida
- `GET /api/products/filters?...` → to'g'ridan-to'g'ri `data` ichida

```jsonc
{
  "price": { "min": 199, "max": 1999.99 },
  "categories": [ { "id": "...", "name": "Smartphones", "slug": "smartphones", "count": 3 } ],
  "brands":     [ { "value": "Apple", "count": 4 }, { "value": "Samsung", "count": 1 } ],
  "attributes": [
    { "key": "Storage", "values": [ { "value": "256GB", "count": 2 }, { "value": "128GB", "count": 1 } ] },
    { "key": "Color",   "values": [ { "value": "Black",  "count": 2 } ] }
  ],
  "counts": { "in_stock": 6, "discounted": 4, "rating_4_plus": 7 },
  "attributes_sampled": false
}
```

Muhim jihatlar:
- Fasetlar **joriy filtr ostida** hisoblanadi — masalan `category_slug=electronics` bersangiz faqat shu bo'limdagi brendlar keladi.
- `price.min/max` esa **narx filtrisiz** hisoblanadi, shunda slider chegaralari o'zini o'zi qisib qo'ymaydi.
- `attributes_sampled: true` bo'lsa — atribut fasetlari birinchi 2000 mahsulot bo'yicha taxminiy (juda katta kataloglarda).

---

## 7. TOP mahsulotlar va bosh sahifa bloklari

### `popularity_score` qanday hisoblanadi

```
popularity_score = sotuvlar × 100  +  reyting × baholovchilar × 20  +  ko'rishlar × 1
```

Bu bazada saqlanadi va o'zi yangilanadi:
- **checkout** → `sales_count` va ball oshadi
- **buyurtma CANCELLED** → ikkalasi ham qaytariladi, zaxira tiklanadi
- **mahsulot ochilganda** → `view_count` va ball oshadi (admin ochsa oshmaydi — statistika buzilmasin)
- **izoh qoldirilganda** → reyting qismi qayta hisoblanadi

### Endpointlar

Barchasi ochiq, `?limit=` (max 50), `?category_id=` / `?category_slug=` bilan cheklanadi. Javob — oddiy massiv.

| Endpoint | Nima qaytaradi |
|---|---|
| `GET /api/products/top` | Avval `is_top` belgilanganlar, keyin ball bo'yicha |
| `GET /api/products/top?only_manual=true` | **Faqat** admin qo'lda belgilaganlari |
| `GET /api/products/best-sellers` | Eng ko'p sotilganlar (hech sotilmaganlar chiqmaydi) |
| `GET /api/products/featured` | `is_featured = true` |
| `GET /api/products/new-arrivals` | Yangi kelganlar. `?within_days=30` |
| `GET /api/products/discounted` | Aksiyadagilar, chegirma foizi bo'yicha |
| `GET /api/products/top-rated` | Eng yuqori baholangan (kamida 1 ta baho bilan) |
| `GET /api/products/:id/related` | O'xshashlar: avval shu kategoriyadan, yetmasa qardosh kategoriyalardan |

```
GET /api/products/top?category_slug=smartphones&limit=6
→ smartfonlar bo'limining TOP 6 tasi
```

---

## 8. Izohlar va reyting

| Metod | Yo'l | Kim |
|---|---|---|
| GET | `/api/products/:productId/reviews` | Ochiq |
| GET | `/api/products/:productId/reviews/summary` | Ochiq |
| POST | `/api/products/:productId/reviews` | Auth |
| DELETE | `/api/reviews/:id` | Muallif yoki ADMIN |

**POST body:** `{ "rating": 1..5, "comment": "..." }` (comment ixtiyoriy, max 2000 belgi)

- Bir foydalanuvchi bir mahsulotga **bitta** baho qoldiradi. Qayta yuborsa — yangilanadi (upsert), dublikat chiqmaydi. Frontendda "tahrirlash" alohida endpoint talab qilmaydi.
- Foydalanuvchi shu mahsulotni haqiqatdan sotib olgan bo'lsa `is_verified_purchase: true` — "Tasdiqlangan xarid" belgisi uchun.
- Har o'zgarishda mahsulotning `rating` / `rating_count` / `popularity_score` darhol yangilanadi.

**Ro'yxat query:** `page`, `limit`, `rating` (faqat shu yulduzdagilar), `verified_only`, `sort` (`newest`|`oldest`|`rating_desc`|`rating_asc`).

**`meta.summary`** — reyting diagrammasi uchun:

```json
{ "average": 4.6, "count": 57, "distribution": { "1": 1, "2": 0, "3": 4, "4": 12, "5": 40 } }
```

---

## 9. Admin: mahsulot boshqaruvi

| Metod | Yo'l | Izoh |
|---|---|---|
| POST | `/api/products` | Yaratish |
| PATCH | `/api/products/:id` | Yangilash |
| PATCH | `/api/products/:id/flags` | `{ is_top?, is_featured?, is_archived? }` — bitta bayroqni tez almashtirish |
| PATCH | `/api/products/:id/stock` | `{ "quantity": 25 }` — qo'shadi, manfiy son ayiradi. Natija < 0 bo'lsa 400 |
| PATCH | `/api/products/bulk/archive` | `{ "ids": [...], "is_archived": true }` → `{ "updated": 5 }` |
| DELETE | `/api/products/:id` | Buyurtma tarixi uchun arxivlash afzalroq |

**Create/Update body:** `name`, `slug?`, `sku?`, `description?`, `brand?`, `tags?`, `price`, `discount_price?`, `stock?`, `images?`, `category_id`, `attributes?`, `is_top?`, `is_featured?`, `is_archived?` (faqat update).

Server tomonda tekshiriladi (hammasi 400/404/409 va tarjima qilingan xabar bilan):

| Holat | Kod |
|---|---|
| `discount_price >= price` | 400 |
| SKU takrorlanishi | 409 |
| Kategoriya topilmadi | 404 |
| Arxivlangan kategoriyaga qo'shish | 400 |

> `slug` bo'sh qoldirilsa nomdan avtomatik yasaladi va band bo'lsa `-2`, `-3` qo'shiladi. `final_price` va `discount_percent` **hech qachon qo'lda yuborilmaydi** — server hisoblaydi.
> Chegirmani bekor qilish uchun `"discount_price": null` yuboring.

---

## 10. Frontend uchun tavsiya etilgan oqim

**Bosh sahifa** (parallel):
```
GET /api/categories/tree?with_product_count=true
GET /api/products/top?limit=8
GET /api/products/discounted?limit=8
GET /api/products/new-arrivals?limit=8
GET /api/products/best-sellers?limit=8
```

**Katalog / kategoriya sahifasi:**
```
GET /api/categories/slug/:slug
GET /api/products?category_slug=:slug&with_facets=true&sort=relevance&page=1&limit=20
```
Foydalanuvchi filtrni o'zgartirganda — o'sha `GET /api/products` ni yangi query bilan qayta chaqiring; `meta.facets` bilan panel raqamlari o'zi yangilanadi.

**Mahsulot sahifasi** (parallel):
```
GET /api/products/slug/:slug          → breadcrumbs, stock_status, is_new, final_price
GET /api/products/:id/related?limit=8
GET /api/products/:id/reviews?limit=10
```

---

## 11. Backendni ishga tushirish (DevOps eslatmasi)

Schema o'zgargani uchun **bir marta** quyidagi tartib bajarilishi shart:

```bash
npx prisma generate
npm run db:backfill   # eski hujjatlarga slug/final_price/... qo'shadi (MUHIM: db:push dan OLDIN)
npm run db:push       # indekslarni yaratadi
npm run db:seed       # ierarxik demo katalog (ixtiyoriy)
```

> `db:backfill` ni o'tkazib yuborsangiz `db:push` unikal `slug` indeksida `E11000 duplicate key ... slug: null` xatosi bilan to'xtaydi. Skript idempotent — bir necha marta ishga tushirish xavfsiz.

Swagger yangilangan: **http://localhost:3000/api/docs** — har bir query parametrining tavsifi shu yerda.
