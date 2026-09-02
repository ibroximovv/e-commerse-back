# Adminka uchun API qo'llanmasi (React)

Bu hujjat shu backend'ni React adminkasidan ishlatish uchun yozilgan: endpointlar,
javob formati, autentifikatsiya oqimi va amaliy kod namunalari.

- **Base URL:** `http://localhost:3000`
- **Swagger:** `http://localhost:3000/api/docs`
- **Statik fayllar:** `http://localhost:3000/uploads/<fayl>`
- **CORS:** `app.enableCors()` yoqilgan — Vite (`localhost:5173`) dan to'g'ridan-to'g'ri so'rov yuborsa bo'ladi.

---

## 1. Javob formati

Global `ResponseInterceptor` tufayli **hamma muvaffaqiyatli javob bir xil konvertda** keladi:

```jsonc
{
  "success": true,
  "data": { /* yoki [...] */ },
  "message": null,
  "meta": null          // faqat sahifalanadigan ro'yxatlarda to'ladi
}
```

Sahifalanadigan ro'yxatlarda `meta`:

```jsonc
{
  "success": true,
  "data": [ /* ... */ ],
  "meta": {
    "total": 65, "page": 1, "limit": 10, "totalPages": 7,
    "hasNextPage": true, "hasPreviousPage": false,
    "sort": "relevance"
  }
}
```

Xatolar (global `HttpExceptionFilter`):

```jsonc
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Email already registered",   // validatsiya xatosida — massiv
  "path": "/api/auth/register",
  "timestamp": "2026-09-02T18:52:10.277Z"
}
```

```ts
const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
```

> `password` maydoni hamma javoblardan avtomatik olib tashlanadi.

---

## 2. ⚠️ Eng muhim narsa: `?ln` parametri

Backend javoblarni **tarjima qiladi**. Standart til — `uz`. `?ln` yubormasangiz
`name` va `description` lug'atdagi so'zlarga almashtirilib keladi:

```
GET /api/categories          → { "name": "Elektronika" }
GET /api/categories?ln=en    → { "name": "Electronics" }
```

Adminkada bu xavfli: tahrirlash formasiga tarjima qilingan qiymat tushadi va
saqlasangiz bazadagi asl nom buziladi.

**Qoida: adminkadagi HAMMA so'rovga `ln=en` qo'shing** (pastda axios sozlamasi bor).
Tarjima faqat `name`, `description`, `message`, `error`, `full_name` maydonlariga tegadi.

Manba: [translations.ts](../src/common/i18n/translations.ts).

---

## 3. Autentifikatsiya

| Metod | Yo'l | Body | Izoh |
|---|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` | `{ access_token, refresh_token }` |
| POST | `/api/auth/refresh` | `{ refresh_token }` | Yangi juftlik |
| POST | `/api/auth/logout` | — | Stateless, faqat 200 qaytaradi |
| POST | `/api/auth/change-password` | `{ old_password, new_password }` | Token kerak |
| POST | `/api/auth/forgot-password` | `{ email }` | Emailga 6 xonali kod |
| POST | `/api/auth/reset-password` | `{ email, code, new_password }` | Kod 10 daqiqa amal qiladi |
| GET | `/api/users/profile` | — | Joriy foydalanuvchi (rol shu yerdan) |

`register` / `verify` / `resend-code` — mijoz tomoni uchun, adminkaga kerak emas.

### Tokenlar

- `access_token` — **15 daqiqa** (`JWT_ACCESS_EXPIRATION`), `Authorization: Bearer <token>`.
- `refresh_token` — **7 kun**.
- Token ichida: `{ sub, email, role, language }`.
- `logout` server tomonda tokenni bekor qilmaydi — `localStorage` ni tozalash kifoya.

### Admin hisobi

Birinchi admin seed orqali yaratiladi:

```bash
npx prisma db seed
```

Seed hisobi: `admin@gmail.com` / `password` — **productionda darrov almashtiring**.

Keyingi adminlarni `PATCH /api/users/:id/role` orqali tayinlash mumkin.

> `forgot-password` endpointi hisob mavjud-yo'qligidan qat'i nazar bir xil javob
> qaytaradi (`"If the account exists..."`) — email bazasini tergani yo'l qo'ymaslik uchun.
> Ya'ni "bunday email topilmadi" degan xatoni frontendda kutmang.

### Login rad etilishi mumkin bo'lgan holatlar

| Holat | Javob |
|---|---|
| Email/parol xato | 401 `Invalid credentials` |
| Email tasdiqlanmagan | 401 `Account not verified` |
| Token yo'q / eskirgan | 401 `Unauthorized` |
| Roli ADMIN emas | 403 `Forbidden resource` |

---

## 4. React loyihasini ulash

### `.env`

```
VITE_API_URL=http://localhost:3000
```

### `src/lib/api.ts`

```ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Adminkada tarjimani o'chiramiz — 2-bo'limga qarang
  config.params = { ln: 'en', ...(config.params ?? {}) };

  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  return config;
});

export type Meta = {
  total: number; page: number; limit: number; totalPages: number;
  hasNextPage?: boolean; hasPreviousPage?: boolean; sort?: string;
};
type Envelope<T> = { success: boolean; data: T; message?: string; meta?: Meta };

// 401 bo'lsa bir marta refresh qilamiz, navbatdagi so'rovlar shu va'dani kutadi
let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<any>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      refreshing ??= (async () => {
        const refresh_token = localStorage.getItem('refresh_token');
        if (!refresh_token) throw error;

        const { data } = await axios.post<Envelope<Tokens>>(
          `${BASE_URL}/api/auth/refresh`, { refresh_token },
        );
        localStorage.setItem('access_token', data.data.access_token);
        localStorage.setItem('refresh_token', data.data.refresh_token);
        return data.data.access_token;
      })().finally(() => { refreshing = null; });

      try {
        const token = await refreshing;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }

    const raw = error.response?.data?.message ?? error.message;
    return Promise.reject(new Error(Array.isArray(raw) ? raw.join(', ') : raw));
  },
);

export type Tokens = { access_token: string; refresh_token: string };

export async function get<T>(url: string, params?: object): Promise<T> {
  const { data } = await api.get<Envelope<T>>(url, { params });
  return data.data;
}

export async function getList<T>(url: string, params?: object) {
  const { data } = await api.get<Envelope<T[]>>(url, { params });
  return { items: data.data, meta: data.meta };
}

export async function post<T>(url: string, body?: object): Promise<T> {
  const { data } = await api.post<Envelope<T>>(url, body);
  return data.data;
}

export async function patch<T>(url: string, body?: object): Promise<T> {
  const { data } = await api.patch<Envelope<T>>(url, body);
  return data.data;
}

export async function del<T>(url: string): Promise<T> {
  const { data } = await api.delete<Envelope<T>>(url);
  return data.data;
}

// "uploads/x.png" -> "http://localhost:3000/uploads/x.png"
export const fileUrl = (path?: string | null) =>
  path ? `${BASE_URL}/${path.replace(/^\//, '')}` : '';
```

### `src/lib/auth.ts`

```ts
import { get, post, Tokens } from './api';
import type { User } from './types';

export async function login(email: string, password: string) {
  const tokens = await post<Tokens>('/api/auth/login', { email, password });
  localStorage.setItem('access_token', tokens.access_token);
  localStorage.setItem('refresh_token', tokens.refresh_token);

  const me = await get<User>('/api/users/profile');
  if (me.role !== 'ADMIN') {
    localStorage.clear();
    throw new Error('Bu hisob admin emas');
  }
  return me;
}

export const logout = async () => {
  try { await post('/api/auth/logout'); } catch { /* stateless, muhim emas */ }
  localStorage.clear();
  window.location.href = '/login';
};
```

### `ProtectedRoute`

```tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import type { User } from '../lib/types';

export function ProtectedRoute() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['profile'],
    queryFn: () => get<User>('/api/users/profile'),
    retry: false,
  });

  if (isLoading) return <div>Yuklanmoqda...</div>;
  if (isError || data?.role !== 'ADMIN') return <Navigate to="/login" replace />;

  return <Outlet />;
}
```

---

## 5. Endpointlar

Belgilar: 🔓 ochiq · 🔑 token kerak · 👑 faqat ADMIN

### Dashboard — `/api/dashboard`

| Metod | Yo'l | Ruxsat |
|---|---|---|
| GET | `/api/dashboard/stats` | 👑 |

Bitta so'rovda butun bosh sahifa uchun ma'lumot:

```jsonc
{
  "revenue": { "total_revenue": 0, "paid_revenue": 0 },
  "orders": { "total": 0, "pending": 0, "confirmed": 0, "shipped": 0, "delivered": 0, "cancelled": 0 },
  "products": {
    "total_active": 65, "archived": 0,
    "out_of_stock": 0, "low_stock": 1,
    "price_on_request": 54        // narxi kelishiladigan tovarlar
  },
  "users": { "total_users": 3, "verified_users": 2 },
  "monthly_sales": [{ "month": "2026-04", "revenue": 0, "orders": 0 }],  // oxirgi 6 oy
  "recent_orders": [ /* oxirgi 5 ta, user + items.product + payment bilan */ ],
  "top_products": [ /* sotuv bo'yicha 5 ta */ ]
}
```

`total_revenue` — bekor qilinmagan buyurtmalar summasi, `paid_revenue` — haqiqatda
to'langanlari. Ikkalasi farq qilishi normal.

### Mahsulotlar — `/api/products`

| Metod | Yo'l | Ruxsat | Izoh |
|---|---|---|---|
| GET | `/api/products` | 🔓 | Filtr + sahifalash + fasetlar |
| GET | `/api/products/filters` | 🔓 | Faqat fasetlar (filtr paneli uchun) |
| GET | `/api/products/top` · `/best-sellers` · `/featured` · `/new-arrivals` · `/discounted` · `/top-rated` | 🔓 | Tayyor to'plamlar |
| GET | `/api/products/:id` | 🔓 | `breadcrumbs`, `stock_status`, `is_new` bilan |
| GET | `/api/products/slug/:slug` | 🔓 | |
| GET | `/api/products/:id/related` | 🔓 | O'xshash mahsulotlar |
| POST | `/api/products` | 👑 | Yaratish |
| PATCH | `/api/products/:id` | 👑 | Tahrirlash |
| PATCH | `/api/products/:id/flags` | 👑 | `{ is_top?, is_featured?, is_archived? }` |
| PATCH | `/api/products/:id/stock` | 👑 | `{ quantity: 25 }` — **qo'shadi**, manfiy son ayiradi |
| PATCH | `/api/products/bulk/archive` | 👑 | `{ ids: [...], is_archived: true }` |
| DELETE | `/api/products/:id` | 👑 | **Butunlay o'chiradi** |

Asosiy query parametrlari:

| Nomi | Turi | Izoh |
|---|---|---|
| `page` / `limit` | number | `limit` maksimum 100 |
| `search` | string | nom, tavsif, brend, SKU, slug, teglar bo'yicha |
| `category_id` / `category_ids` / `category_slug` | string | `category_ids=id1,id2` |
| `include_descendants` | boolean | default `true` — ota kategoriya tanlansa ichkilari ham chiqadi |
| `min_price` / `max_price` | number | `final_price` (chegirmali narx) bo'yicha |
| `price_on_request` | boolean | `false` — faqat narxi borlari, `true` — faqat kelishiladiganlari |
| `has_discount` / `min_discount_percent` | boolean / number | |
| `brands` | string[] | `brands=OCO,Apple`, registrga befarq |
| `tags` | string[] | `tags=насос,медь` |
| `attributes` | string[] | `attributes=Материал:Медь,Мощность:750` — kalitlar AND, qiymatlar OR |
| `stock_status` | enum | `in_stock` · `out_of_stock` · `low_stock` |
| `min_rating` | number | 0..5 |
| `is_top` / `is_featured` | boolean | |
| `new_within_days` | number | |
| `sort` | enum | `relevance`(default) · `newest` · `oldest` · `price_asc` · `price_desc` · `popular` · `top_rated` · `most_viewed` · `discount` · `name_asc` · `name_desc` |
| `with_facets` | boolean | Javobga `meta.facets` qo'shadi |
| `include_archived` | boolean | **Faqat ADMIN uchun ishlaydi** |

> Adminkada arxivlanganlarni ko'rish uchun `include_archived=true` yuboring
> (eski `all` parametri hali ishlaydi, lekin `deprecated`).

`meta.facets` (`with_facets=true` bilan) filtr panelini to'liq qurishga yetadi:

```jsonc
{
  "price": { "min": 44, "max": 1999.99 },
  "categories": [{ "id": "...", "name": "...", "slug": "...", "count": 14 }],
  "brands": [{ "value": "OCO", "count": 54 }],
  "attributes": [
    { "key": "Мощность", "unit": "Вт", "values": [{ "value": "250", "count": 4 }] }
  ],
  "counts": { "in_stock": 11, "discounted": 4, "rating_4_plus": 6 },
  "attributes_sampled": false
}
```

Yaratish body:

```jsonc
{
  "name": "Автоматический водяной насос PW 750 (медь)",
  "sku": "PW-750",
  "description": "...",
  "brand": "OCO",
  "tags": ["насос", "автоматический", "медь"],
  "price": 1500000,
  "discount_price": 1350000,        // ixtiyoriy, price dan kichik bo'lishi SHART
  "stock": 10,
  "images": ["uploads/1712345678-123.png"],
  "category_id": "<uuid>",
  "attributes": [
    { "key": "Мощность", "value": "750", "unit": "Вт" },
    { "key": "Материал", "value": "Медь" }
  ],
  "is_top": false,
  "is_featured": false
}
```

**Narxi kelishiladigan tovarlar** (bosma katalogda narx ko'rsatilmagan):

```jsonc
{ "name": "...", "category_id": "...", "price_on_request": true }
```

`price_on_request: true` bo'lsa `price` yuborish shart emas — 0 saqlanadi,
chegirma o'chiriladi. Bunday mahsulotni mijoz **savatga qo'sha olmaydi va
buyurtma qila olmaydi** (400 qaytadi). Adminkada narx maydonini `disabled` qiling
va kartochkada "Narx kelishilgan holda" deb ko'rsating.

`slug` yubormasangiz `name` dan avtomatik yasaladi (kirill ham qo'llab-quvvatlanadi).
`sku` avtomatik `TRIM + UPPERCASE` qilinadi va takrorlansa 409 qaytadi.

### Kategoriyalar — `/api/categories`

Kategoriyalar **daraxt** ko'rinishida — cheksiz ichki daraja bo'lishi mumkin.

| Metod | Yo'l | Ruxsat | Izoh |
|---|---|---|---|
| GET | `/api/categories` | 🔓 | Sahifalanadigan ro'yxat |
| GET | `/api/categories/tree` | 🔓 | Butun daraxt bitta so'rovda |
| GET | `/api/categories/:id` | 🔓 | `breadcrumbs` + `product_count` bilan |
| GET | `/api/categories/slug/:slug` | 🔓 | |
| GET | `/api/categories/:id/breadcrumbs` | 🔓 | |
| POST | `/api/categories` | 👑 | |
| PATCH | `/api/categories/:id` | 👑 | `+ is_archived?` |
| DELETE | `/api/categories/:id` | 👑 | Faqat **bo'sh** kategoriyani o'chiradi |

Query: `page`, `limit`, `search`, `parent_id`, `root_only`, `is_featured`,
`include_archived` (👑), `with_product_count`, `sortBy` (`sort_order` · `name` · `created_at` · `updated_at`).

Body: `{ name, slug?, description?, image?, icon?, parent_id?, is_featured?, sort_order? }`

Muhim xulq-atvor:

- **O'chirish himoyalangan.** Ichida subkategoriya yoki mahsulot bo'lsa `400` qaytadi —
  o'rniga `PATCH { is_archived: true }` ishlating.
- **Arxivlash kaskad.** Kategoriyani arxivlasangiz ichki kategoriyalari **va**
  mahsulotlari ham arxivlanadi. Tiklash ham xuddi shunday.
- **Sikl bloklangan.** Kategoriyani o'z avlodi ostiga ko'chirib bo'lmaydi (`400`).
- `name` takrorlansa `409` qaytadi.

Daraxtni select uchun tekislash:

```ts
type Node = { id: string; name: string; children: Node[] };

const flatten = (nodes: Node[], depth = 0): { id: string; label: string }[] =>
  nodes.flatMap((n) => [
    { id: n.id, label: `${'— '.repeat(depth)}${n.name}` },
    ...flatten(n.children, depth + 1),
  ]);
```

### Buyurtmalar — `/api/orders`

| Metod | Yo'l | Ruxsat | Izoh |
|---|---|---|---|
| GET | `/api/orders/admin/all` | 👑 | **Sahifalanadi**, filtrlar bilan |
| GET | `/api/orders/:id` | 🔑 | Admin istalganini |
| PATCH | `/api/orders/:id/status` | 👑 | `{ "status": "SHIPPED" }` |
| PATCH | `/api/orders/:id/cancel` | 🔑 | Admin istalganini, mijoz faqat `PENDING` ni |
| GET | `/api/orders` | 🔑 | O'z buyurtmalari (`?archived=true`) |
| POST | `/api/orders/checkout` | 🔑 | Savatdan buyurtma |
| PATCH | `/api/orders/:id/archive` | 🔑 | |

`admin/all` query: `page`, `limit`, `search`, `status`, `start_date`, `end_date`,
`min_amount`, `max_amount`, `sortBy` (`created_at` · `updated_at` · `total_amount` · `status`), `sortOrder`.

`search` buyurtma ID si, `customer_name`, `customer_phone`, `shipping_address`,
foydalanuvchi emaili va ismi bo'yicha ishlaydi.

`start_date` / `end_date` — `YYYY-MM-DD` yoki to'liq ISO. Vaqtsiz `end_date`
avtomatik **kun oxiriga** suriladi, ya'ni `end_date=2026-09-02` o'sha kunning
buyurtmalarini ham qamrab oladi.

Buyurtmada mijoz ma'lumotlari bor: `shipping_address`, `customer_phone`,
`customer_name`, `notes`, `payment_method`.

Statuslar: `PENDING` → `CONFIRMED` → `SHIPPED` → `DELIVERED`, yoki `CANCELLED`.

> Backend statuslar ketma-ketligini tekshirmaydi — `DELIVERED` dan `PENDING` ga
> ham qaytarsa bo'ladi. Mantiqni adminka o'zi cheklashi kerak.
>
> `CANCELLED` ga o'tkazish **zaxirani qaytaradi** va sotuv statistikasini kamaytiradi.
> Bekor qilingan buyurtmani qayta `CONFIRMED` qilsangiz zaxira **avtomatik
> ayirilmaydi** — bu holatni adminkada taqiqlang.

### To'lovlar — `/api/payments`

| Metod | Yo'l | Ruxsat |
|---|---|---|
| GET | `/api/payments/admin/all` | 👑 |
| GET | `/api/payments/status/:order_id` | 🔑 |
| POST | `/api/payments` | 🔑 |

`admin/all` query: `page`, `limit`, `search`, `status`, `provider`.

Statuslar: `PENDING`, `SUCCESSFUL`, `FAILED`, `REFUNDED`. To'lov muvaffaqiyatli
bo'lsa buyurtma avtomat `CONFIRMED` ga o'tadi.

> To'lov hozircha **soxta (mock)** — haqiqiy provayder ulanmagan.
> `POST /api/payments` faqat **o'z** buyurtmasini to'laydi, admin boshqa
> foydalanuvchi nomidan to'lay olmaydi (404). Adminkada faqat statusni ko'rsating.

### Foydalanuvchilar — `/api/users`

| Metod | Yo'l | Ruxsat | Izoh |
|---|---|---|---|
| GET | `/api/users/profile` | 🔑 | Joriy foydalanuvchi |
| PATCH | `/api/users/profile` | 🔑 | `{ full_name?, phone?, photo?, language? }` |
| GET | `/api/users/stats` | 👑 | Rol bo'yicha sanoq |
| GET | `/api/users` | 👑 | **Sahifalanadi**: `page`, `limit`, `search`, `role`, `sortBy`, `sortOrder` |
| GET | `/api/users/:id` | 👑 | |
| PATCH | `/api/users/:id/role` | 👑 | `{ "role": "ADMIN" }` |
| PATCH | `/api/users/:id` | 👑 | Profil maydonlari (rol emas) |
| DELETE | `/api/users/:id` | 👑 | |

`language` faqat `uz` · `ru` · `en`.

**Adminni qulflab qo'yishdan himoya** — quyidagi holatlarda `400` qaytadi:

| Harakat | Xabar |
|---|---|
| O'zidan ADMIN rolini olib tashlash | `You cannot remove the ADMIN role from your own account` |
| O'z hisobini o'chirish | `You cannot delete your own account` |
| Oxirgi adminni USER qilish yoki o'chirish | `Cannot remove the last ADMIN account...` |

Adminkada bu tugmalarni joriy foydalanuvchi uchun `disabled` qiling.

### Sharhlar — `/api/products/:productId/reviews`

| Metod | Yo'l | Ruxsat |
|---|---|---|
| GET | `/api/products/:productId/reviews` | 🔓 |
| GET | `/api/products/:productId/reviews/summary` | 🔓 |
| POST | `/api/products/:productId/reviews` | 🔑 |
| DELETE | `/api/reviews/:id` | 🔑 (egasi yoki admin) |

Har bir foydalanuvchi bitta mahsulotga bitta sharh yozadi (qayta yuborsa yangilanadi).
Sharh yozilganda mahsulotning `rating` va `popularity_score` avtomatik qayta hisoblanadi.

### Fayl yuklash — `/api/upload`

| Metod | Yo'l | Ruxsat | Izoh |
|---|---|---|---|
| POST | `/api/upload` | 🔑 | Maydon nomi `file` |
| POST | `/api/upload/multiple` | 🔑 | Maydon nomi `files`, **10 tagacha** |
| DELETE | `/api/upload?path=uploads/xxx.png` | 🔑 | Faylni o'chiradi |

- `multipart/form-data`, faqat rasm: `jpg`, `jpeg`, `png`, `gif`, `webp`
- Maksimum **10MB**
- Javob: `{ "message": "...", "url": "uploads/1712345678-123.png" }`
  (bir nechta bo'lsa `urls: [...]`)

`url` **nisbiy** — bazaga aynan shu ko'rinishda saqlang, ko'rsatishda `fileUrl()` bilan to'ldiring.

```ts
export async function uploadImages(files: File[]): Promise<string[]> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));

  const { data } = await api.post('/api/upload/multiple', form);
  return data.data?.urls ?? data.urls;
}
```

> `DELETE /api/upload` faqat fayl tizimidan o'chiradi — mahsulotdagi `images`
> massividan qo'lda olib tashlash kerak.

---

## 6. TypeScript tiplari

```ts
export type Role = 'ADMIN' | 'USER';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface User {
  id: string; email: string; full_name?: string; phone?: string; photo?: string;
  role: Role; is_verified: boolean; language: 'uz' | 'ru' | 'en';
  created_at: string; updated_at: string;
}

export interface Category {
  id: string; name: string; slug: string; description?: string;
  image?: string; icon?: string;
  parent_id: string | null; is_archived: boolean; is_featured: boolean;
  sort_order: number; created_at: string; updated_at: string;
  children?: Category[]; product_count?: number;
  breadcrumbs?: { id: string; name: string; slug: string }[];
}

export interface ProductAttribute { key: string; value: string; unit?: string | null }

export interface Product {
  id: string; name: string; slug: string; sku?: string | null;
  description?: string; brand?: string | null; tags: string[];
  price: number;
  price_on_request: boolean;      // true -> narx yo'q, sotib bo'lmaydi
  discount_price?: number | null;
  final_price: number;            // filtr va sortlash SHU maydon ustida
  discount_percent: number;
  stock: number; images: string[];
  attributes: ProductAttribute[];
  is_archived: boolean; is_top: boolean; is_featured: boolean;
  sales_count: number; view_count: number;
  rating: number; rating_count: number; popularity_score: number;
  category_id: string; category?: Pick<Category, 'id' | 'name' | 'slug' | 'parent_id'>;
  created_at: string; updated_at: string;
  // faqat detail endpointda:
  breadcrumbs?: { id: string; name: string; slug: string }[];
  stock_status?: StockStatus; is_new?: boolean;
}

export interface Order {
  id: string; user_id: string; user?: User;
  total_amount: number; status: OrderStatus; is_archived: boolean;
  shipping_address?: string | null; customer_phone?: string | null;
  customer_name?: string | null; notes?: string | null; payment_method?: string | null;
  created_at: string; updated_at: string;
  items: { id: string; product_id: string; product: Product; quantity: number; price_at_purchase: number }[];
  payment?: { id: string; amount: number; provider: string; status: PaymentStatus; transaction_id?: string };
}
```

---

## 7. TanStack Query misollari

```tsx
export function useProducts(filters: {
  page: number; limit: number; search?: string; category_id?: string;
}) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => getList<Product>('/api/products', {
      ...filters,
      include_archived: true,   // adminkada arxivlanganlar ham kerak
      with_facets: true,
    }),
    placeholderData: (prev) => prev,
  });
}
```

```tsx
export function useProductMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] });

  return {
    create: useMutation({ mutationFn: (b: object) => post('/api/products', b), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: object }) => patch(`/api/products/${id}`, body),
      onSuccess: invalidate,
    }),
    // O'chirish o'rniga arxivlash tavsiya etiladi
    archive: useMutation({
      mutationFn: (id: string) => patch(`/api/products/${id}/flags`, { is_archived: true }),
      onSuccess: invalidate,
    }),
    bulkArchive: useMutation({
      mutationFn: (ids: string[]) => patch('/api/products/bulk/archive', { ids, is_archived: true }),
      onSuccess: invalidate,
    }),
    // Zaxirani QO'SHADI/AYIRADI, o'rnatmaydi
    adjustStock: useMutation({
      mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
        patch(`/api/products/${id}/stock`, { quantity }),
      onSuccess: invalidate,
    }),
  };
}
```

```tsx
const updateStatus = useMutation({
  mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
    patch(`/api/orders/${id}/status`, { status }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
});
```

---

## 8. Adminka sahifalari

| Sahifa | Endpointlar |
|---|---|
| Login | `POST /api/auth/login` + `GET /api/users/profile` |
| Dashboard | `GET /api/dashboard/stats` (bitta so'rov yetadi) |
| Mahsulotlar | `GET/POST/PATCH/DELETE /api/products`, `/flags`, `/stock`, `/bulk/archive` + `POST /api/upload` |
| Kategoriyalar | `GET /api/categories/tree`, `POST/PATCH/DELETE /api/categories/:id` |
| Buyurtmalar | `GET /api/orders/admin/all`, `GET /api/orders/:id`, `PATCH /api/orders/:id/status`, `/cancel` |
| To'lovlar | `GET /api/payments/admin/all` |
| Foydalanuvchilar | `GET /api/users`, `/stats`, `PATCH /api/users/:id`, `/role`, `DELETE /api/users/:id` |
| Profil / parol | `GET+PATCH /api/users/profile`, `POST /api/auth/change-password` |

---

## 9. Esda tutish kerak bo'lgan joylar

1. **`ln=en` ni unutmang** — aks holda tahrirlash formasiga tarjima qilingan matn tushadi va saqlaganda asl nom buziladi.
2. **`price_on_request: true` mahsulotlar sotilmaydi** — savat va checkout ularni 400 bilan rad etadi. Narx maydonini `disabled` qiling, kartochkada "Narx kelishilgan holda" deb yozing.
3. **`PATCH /:id/stock` zaxirani qo'shadi, o'rnatmaydi.** Aniq qiymat qo'yish uchun `PATCH /:id` ga `{ stock: N }` yuboring.
4. **`DELETE` haqiqiy o'chirish.** Odatiy holatda `PATCH /:id/flags { is_archived: true }` (mahsulot) yoki `PATCH /:id { is_archived: true }` (kategoriya) ishlating.
5. **Kategoriyani arxivlash kaskad** — ichidagi hamma narsa arxivlanadi. Foydalanuvchini ogohlantiring.
6. **Buyurtmani `CANCELLED` qilish zaxirani qaytaradi**, lekin orqaga qaytarish zaxirani qayta ayirmaydi — bekor qilingandan keyin status o'zgartirishni taqiqlang.
7. **Adminni qulflab qo'yish himoyalangan** (5-bo'limga qarang) — tegishli tugmalarni `disabled` qiling.
8. **`min_price`/`max_price` `final_price` ustida ishlaydi** — ya'ni chegirmali narx bo'yicha.
9. **Access token 15 daqiqa** — refresh interceptor bo'lmasa adminka har 15 daqiqada chiqib ketadi.
10. **Narx `Float`** — `Number` yuboring, string emas (`"999.99"` validatsiyadan o'tmaydi).
11. **`discount_price` `price` dan kichik bo'lishi shart**, aks holda 400. Chegirmani bekor qilish uchun `null` yuboring.
12. **Fasetlar 2000 ta mahsulotdan namuna oladi** — `meta.facets.attributes_sampled: true` bo'lsa atribut ro'yxati to'liq emas.

---

## 10. Bosma katalogni yuklash

`Каталог 2026-III` (ООО «OCO») — 8 kategoriya, 54 mahsulot — `prisma/catalog/` da
JSON ko'rinishida saqlangan va alohida skript bilan yuklanadi:

```bash
npm run db:import:catalog -- --dry-run
```

Batafsil: [prisma/catalog/README.md](../prisma/catalog/README.md).

Katalogda narxlar ko'rsatilmagani uchun 54 ta mahsulotning hammasi
`price_on_request: true` bilan keladi. Adminkada ularni topish:

```
GET /api/products?price_on_request=true&include_archived=true&limit=100
```

Narx kiritilgach `price` ni to'ldirib `price_on_request` ni `false` qiling —
shundan keyin mahsulot savatga tushadi.
