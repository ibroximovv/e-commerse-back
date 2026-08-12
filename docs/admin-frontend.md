# Adminka uchun API qo'llanmasi (React)

Bu hujjat shu backend'ni React adminkasidan ishlatish uchun yozilgan. Barcha endpointlar, javob formati, autentifikatsiya oqimi va amaliy kod namunalari shu yerda.

- **Base URL:** `http://localhost:3000`
- **Swagger:** `http://localhost:3000/api/docs`
- **Statik fayllar:** `http://localhost:3000/uploads/<fayl>`
- **CORS:** backend'da `app.enableCors()` yoqilgan, ya'ni `localhost:5173` (Vite) dan to'g'ridan-to'g'ri so'rov yuborsa bo'ladi.

---

## 1. Javob formati

Backend'da global `ResponseInterceptor` bor, shuning uchun **hamma muvaffaqiyatli javob bir xil konvertda** keladi:

```jsonc
{
  "success": true,
  "data": { /* yoki [...] */ },
  "message": null,
  "meta": null          // faqat sahifalanadigan ro'yxatlarda to'ladi
}
```

Sahifalanadigan ro'yxat (hozircha faqat `GET /api/products`):

```jsonc
{
  "success": true,
  "data": [ /* mahsulotlar */ ],
  "meta": { "total": 25, "page": 1, "limit": 10, "totalPages": 3 }
}
```

Xatolar (global `HttpExceptionFilter`):

```jsonc
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Email already registered",       // validatsiya xatosida — massiv
  "path": "/api/auth/register",
  "timestamp": "2026-08-12T18:52:10.277Z"
}
```

Validatsiya xatosida `message` **massiv** bo'ladi:

```jsonc
{ "message": ["email must be an email", "password must be longer than or equal to 6 characters"] }
```

Frontendda shuni hisobga oling:

```ts
const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
```

> `password` maydoni hamma javoblardan avtomatik olib tashlanadi — foydalanuvchilar ro'yxatida ham parol hech qachon kelmaydi.

---

## 2. ⚠️ Eng muhim narsa: `?ln` parametri

Backend javoblarni **tarjima qiladi**. Standart til — `uz`. Ya'ni `?ln` yubormasangiz, `name` va `description` maydonlari lug'atdagi so'zlarga almashtirilib keladi:

```bash
GET /api/categories          → { "name": "Elektronika", "description": "Smartfonlar va gadjetlar" }
GET /api/categories?ln=en    → { "name": "Electronics", "description": "Smartphones and gadgets" }
```

Adminkada bu juda xavfli: tahrirlash formasiga tarjima qilingan qiymat tushadi, saqlasangiz bazadagi asl nom buziladi.

**Qoida: adminkadagi HAMMA so'rovga `ln=en` qo'shing.** Buni axios'da bir marta sozlab qo'yamiz (pastda kod bor). Tarjima faqat `name`, `description`, `message`, `error`, `full_name` maydonlariga tegadi.

Tarjima manbasi: [translations.ts](../src/common/i18n/translations.ts).

---

## 3. Autentifikatsiya

### Adminka uchun kerakli endpointlar

| Metod | Yo'l | Body | Izoh |
|---|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` | `{ access_token, refresh_token }` qaytadi |
| POST | `/api/auth/refresh` | `{ refresh_token }` | Yangi juftlik qaytadi |
| POST | `/api/auth/change-password` | `{ old_password, new_password }` | Token kerak |
| GET | `/api/users/profile` | — | Joriy foydalanuvchi (rolni shu yerdan oling) |

`register` / `verify` / `resend-code` — bular mijoz (do'kon) tomoni uchun, adminkaga kerak emas.

### Tokenlar

- `access_token` — **15 daqiqa** (`JWT_ACCESS_EXPIRATION`), har bir so'rovda `Authorization: Bearer <token>`.
- `refresh_token` — **7 kun** (`JWT_REFRESH_EXPIRATION`).
- Token ichida: `{ sub: userId, email, role, language }`.

### Admin hisobi qayerdan olinadi

**API orqali admin yaratib bo'lmaydi.** `role` maydoni hech qaysi DTO'da yo'q, ya'ni `PATCH /api/users/:id` orqali ham rolni o'zgartira olmaysiz. Admin faqat seed orqali yoki bazadan qo'lda yaratiladi:

```bash
npx prisma db seed
```

Seed hisobi: `admin@gmail.com` / `password` (prod'da darrov almashtiring).

> Agar adminkada "foydalanuvchini admin qilish" tugmasi kerak bo'lsa, backend'ga alohida endpoint qo'shish kerak — hozir yo'q.

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

### `src/lib/api.ts` — axios instance + avtomatik refresh

```ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Adminkada tarjimani o'chirib qo'yamiz — 2-bo'limga qarang
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.params = { ln: 'en', ...(config.params ?? {}) };

  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  return config;
});

// Konvertni ochib tashlaymiz: javob to'g'ridan-to'g'ri data bo'lib keladi
type Envelope<T> = { success: boolean; data: T; message?: string; meta?: Meta };
export type Meta = { total: number; page: number; limit: number; totalPages: number };

// 401 bo'lsa — bir marta refresh qilamiz va navbatdagi so'rovlarni kutib turamiz
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
          `${BASE_URL}/api/auth/refresh`,
          { refresh_token },
        );
        localStorage.setItem('access_token', data.data.access_token);
        localStorage.setItem('refresh_token', data.data.refresh_token);
        return data.data.access_token;
      })().finally(() => {
        refreshing = null;
      });

      try {
        const token = await refreshing;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }

    // Xato matnini bir xil ko'rinishga keltiramiz
    const raw = error.response?.data?.message ?? error.message;
    return Promise.reject(new Error(Array.isArray(raw) ? raw.join(', ') : raw));
  },
);

export type Tokens = { access_token: string; refresh_token: string };

// Yordamchilar: konvertdan data/meta ni ajratib beradi
export async function get<T>(url: string, params?: object): Promise<T> {
  const { data } = await api.get<Envelope<T>>(url, { params });
  return data.data;
}

export async function getList<T>(url: string, params?: object): Promise<{ items: T[]; meta?: Meta }> {
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

// Rasm yo'lini to'liq URL ga aylantirish: "uploads/x.png" -> "http://localhost:3000/uploads/x.png"
export const fileUrl = (path?: string | null) =>
  path ? `${BASE_URL}/${path.replace(/^\//, '')}` : '';
```

### `src/lib/auth.ts` — kirish va rolni tekshirish

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

export const logout = () => {
  localStorage.clear();          // backend'da logout endpoint yo'q, token stateless
  window.location.href = '/login';
};

export const isLoggedIn = () => !!localStorage.getItem('access_token');
```

> Rolni token ichidan `atob(token.split('.')[1])` bilan ham o'qish mumkin, lekin `GET /api/users/profile` ishonchliroq — bazadagi haqiqiy holatni beradi.

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

### Mahsulotlar — `/api/products`

| Metod | Yo'l | Ruxsat | Izoh |
|---|---|---|---|
| GET | `/api/products` | 🔓 | Sahifalash + filtr, `meta` qaytadi |
| GET | `/api/products/:id` | 🔓 | Bitta mahsulot |
| POST | `/api/products` | 👑 | Yaratish |
| PATCH | `/api/products/:id` | 👑 | Tahrirlash / arxivlash |
| DELETE | `/api/products/:id` | 👑 | **Bazadan butunlay o'chiradi** |

Query parametrlari:

| Nomi | Turi | Standart | Izoh |
|---|---|---|---|
| `page` | number | 1 | |
| `limit` | number | 10 | |
| `search` | string | — | `name` va `description` bo'yicha, katta-kichik harf farqsiz |
| `category_id` | string | — | |
| `min_price` / `max_price` | number | — | |
| `sortBy` | string | `created_at` | `name`, `price`, `stock`, `created_at` |
| `sortOrder` | `asc`\|`desc` | `desc` | |
| `all` | boolean | false | **Arxivlanganlarni ham ko'rsatish** |

> ⚠️ `all=false` deb **yubormang** — bu bug tufayli `true` kabi ishlaydi (tekshirilgan: `?all=false` arxivlangan mahsulotni ham qaytaradi). Arxivlanganlar kerak bo'lmasa parametrni umuman qo'shmang. Adminkada odatda `all=true` kerak bo'ladi.

Yaratish body:

```jsonc
{
  "name": "iPhone 15 Pro",
  "description": "Latest Apple iPhone",
  "price": 999.99,
  "stock": 50,
  "images": ["uploads/1712345678-123.png"],
  "category_id": "<category uuid>",
  "attributes": [{ "key": "Color", "value": "Black" }]
}
```

`PATCH` da hamma maydon ixtiyoriy, qo'shimcha `is_archived: boolean` bor.

### Kategoriyalar — `/api/categories`

| Metod | Yo'l | Ruxsat | Izoh |
|---|---|---|---|
| GET | `/api/categories` | 🔓 | Faqat arxivlanmaganlar |
| GET | `/api/categories?all=true` | 🔓 | Arxivlanganlar bilan birga |
| GET | `/api/categories/:id` | 🔓 | |
| POST | `/api/categories` | 👑 | `{ name, description?, image? }` |
| PATCH | `/api/categories/:id` | 👑 | `+ is_archived?` |
| DELETE | `/api/categories/:id` | 👑 | **Butunlay o'chiradi** |

Sahifalash yo'q — hammasi bitta massiv bo'lib keladi.

> ⚠️ Schema'da `name` `@unique` deb belgilangan, lekin **MongoDB'da bu indeks amalda yaratilmagan** — bir xil nomli kategoriya bemalol qo'shilaveradi (tekshirildi: bazada hozir ikkita "Electronics" bor). Takrorlanishni adminka o'zi tekshirishi kerak: saqlashdan oldin mavjud ro'yxatdan qidiring. Indeksni bazaga yozish uchun backend'da `npx prisma db push` ishga tushirilishi kerak.

> ⚠️ Kategoriyani o'chirsangiz, unga bog'langan mahsulotlarning `category_id` si osilib qoladi (MongoDB'da foreign key tekshiruvi yo'q) va mahsulotlar ro'yxati xato berishi mumkin. O'chirish o'rniga `PATCH { is_archived: true }` ishlating.

### Foydalanuvchilar — `/api/users`

| Metod | Yo'l | Ruxsat | Izoh |
|---|---|---|---|
| GET | `/api/users/profile` | 🔑 | Joriy foydalanuvchi |
| PATCH | `/api/users/profile` | 🔑 | `{ full_name?, phone?, photo?, language? }` |
| GET | `/api/users` | 👑 | Hammasi, **sahifalashsiz** |
| GET | `/api/users/:id` | 👑 | |
| PATCH | `/api/users/:id` | 👑 | Faqat yuqoridagi 4 ta maydon — **`role` yo'q** |
| DELETE | `/api/users/:id` | 👑 | Butunlay o'chiradi |

`language` faqat `uz` \| `ru` \| `en` bo'lishi mumkin.

### Buyurtmalar — `/api/orders`

| Metod | Yo'l | Ruxsat | Izoh |
|---|---|---|---|
| GET | `/api/orders/admin/all` | 👑 | Hamma buyurtma, ichida `user`, `items.product`, `payment` |
| GET | `/api/orders/:id` | 🔑 | Admin istalganini, oddiy user faqat o'zinikini |
| PATCH | `/api/orders/:id/status` | 👑 | `{ "status": "SHIPPED" }` |
| GET | `/api/orders` | 🔑 | O'z buyurtmalari (`?archived=true`) |
| POST | `/api/orders/checkout` | 🔑 | Savatdan buyurtma yasaydi |
| PATCH | `/api/orders/:id/archive` | 🔑 | Faqat o'z buyurtmasini yashiradi |

Status qiymatlari: `PENDING` → `CONFIRMED` → `SHIPPED` → `DELIVERED`, yoki `CANCELLED`.
Backend statuslar ketma-ketligini tekshirmaydi — `DELIVERED` dan `PENDING` ga ham qaytarsa bo'ladi. Mantiqni adminka o'zi cheklashi kerak.

> `admin/all` da sahifalash yo'q va buyurtmalar soni ko'paysa javob og'irlashadi. Kerak bo'lsa frontendda cheklab ko'rsating.

### To'lovlar — `/api/payments`

| Metod | Yo'l | Ruxsat | Izoh |
|---|---|---|---|
| GET | `/api/payments/status/:order_id` | 🔑 | Admin istalgan buyurtmaniki |
| POST | `/api/payments` | 🔑 | `{ order_id, provider }` |

> `POST /api/payments` faqat **o'z** buyurtmasini to'laydi — admin boshqa foydalanuvchi nomidan to'lay olmaydi (404 keladi). Adminkada to'lov tugmasi qo'ymang, faqat statusni ko'rsating.

To'lov statuslari: `PENDING`, `SUCCESSFUL`, `FAILED`, `REFUNDED`. To'lov muvaffaqiyatli bo'lsa buyurtma avtomat `CONFIRMED` ga o'tadi. Hozircha to'lov **soxta** (mock) — haqiqiy provayder ulanmagan.

### Savat — `/api/carts`

Adminkaga odatda kerak emas (har bir foydalanuvchi faqat o'z savatini ko'radi), lekin bor: `GET /api/carts`, `POST /api/carts/items`, `PATCH /api/carts/items/:product_id`, `DELETE /api/carts/items/:product_id`, `DELETE /api/carts`.

### Fayl yuklash — `/api/upload`

| Metod | Yo'l | Ruxsat |
|---|---|---|
| POST | `/api/upload` | 🔑 |

- `multipart/form-data`, maydon nomi — **`file`**
- Faqat rasm: `jpg`, `jpeg`, `png`, `gif`, `webp`
- Maksimum **5MB**
- Javob: `{ "message": "File uploaded successfully", "url": "uploads/1712345678-123.png" }`

Diqqat: `url` **nisbiy** yo'l va boshida `/` yo'q. Ko'rsatish uchun `fileUrl()` bilan to'liq manzil yasang. Bazaga esa aynan shu nisbiy yo'lni saqlang (`images: ["uploads/..."]`).

```tsx
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);

  const { data } = await api.post('/api/upload', form);   // Content-Type ni axios o'zi qo'yadi
  return data.data?.url ?? data.url;
}
```

---

## 6. TanStack Query bilan amaliy misollar

```ts
// src/lib/types.ts
export type Role = 'ADMIN' | 'USER';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';

export interface User {
  id: string; email: string; full_name?: string; phone?: string; photo?: string;
  role: Role; is_verified: boolean; language: 'uz' | 'ru' | 'en';
  created_at: string; updated_at: string;
}

export interface Category {
  id: string; name: string; description?: string; image?: string;
  is_archived: boolean; created_at: string; updated_at: string;
}

export interface Product {
  id: string; name: string; description?: string; price: number; stock: number;
  images: string[]; attributes: { key: string; value: string }[];
  is_archived: boolean; category_id: string; category?: Category;
  created_at: string; updated_at: string;
}

export interface Order {
  id: string; user_id: string; user?: User; total_amount: number;
  status: OrderStatus; is_archived: boolean; created_at: string;
  items: { id: string; product_id: string; product: Product; quantity: number; price_at_purchase: number }[];
  payment?: { id: string; amount: number; provider: string; status: PaymentStatus; transaction_id?: string };
}
```

Mahsulotlar ro'yxati (filtr + sahifalash):

```tsx
import { useQuery } from '@tanstack/react-query';
import { getList } from '../lib/api';
import type { Product } from '../lib/types';

export function useProducts(filters: {
  page: number; limit: number; search?: string; category_id?: string;
}) {
  return useQuery({
    queryKey: ['products', filters],
    // all: true -> arxivlanganlarni ham ko'rsatadi (adminkaga kerak)
    queryFn: () => getList<Product>('/api/products', { ...filters, all: true }),
    placeholderData: (prev) => prev,          // sahifa almashganda "sakramaydi"
  });
}
```

Yaratish / tahrirlash / arxivlash:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post, patch, del } from '../lib/api';

export function useProductMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] });

  return {
    create: useMutation({ mutationFn: (body: object) => post('/api/products', body), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: object }) => patch(`/api/products/${id}`, body),
      onSuccess: invalidate,
    }),
    // O'chirish o'rniga arxivlash tavsiya etiladi
    archive: useMutation({
      mutationFn: (id: string) => patch(`/api/products/${id}`, { is_archived: true }),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => del(`/api/products/${id}`), onSuccess: invalidate }),
  };
}
```

Buyurtma statusini o'zgartirish:

```tsx
const updateStatus = useMutation({
  mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
    patch(`/api/orders/${id}/status`, { status }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
});
```

---

## 7. Adminka sahifalari

| Sahifa | Endpointlar |
|---|---|
| Login | `POST /api/auth/login` + `GET /api/users/profile` (rol tekshiruvi) |
| Dashboard | `GET /api/orders/admin/all` (statuslar bo'yicha sanash), `GET /api/products?all=true&limit=1` (jami soni `meta.total` dan) |
| Mahsulotlar | `GET/POST/PATCH/DELETE /api/products` + `POST /api/upload` |
| Kategoriyalar | `GET /api/categories?all=true`, `POST/PATCH/DELETE /api/categories/:id` |
| Buyurtmalar | `GET /api/orders/admin/all`, `GET /api/orders/:id`, `PATCH /api/orders/:id/status` |
| Foydalanuvchilar | `GET /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id` |
| Profil / parol | `GET+PATCH /api/users/profile`, `POST /api/auth/change-password` |

Dashboard uchun tayyor statistika endpointi yo'q — sanoqlarni frontendda hisoblashingiz kerak (yoki backend'ga qo'shish kerak).

---

## 8. Esda tutish kerak bo'lgan joylar

1. **`ln=en` ni unutmang** — aks holda tahrirlash formasiga tarjima qilingan matn tushadi va saqlaganda asl nom buziladi.
2. **`all=false` yubormang** (mahsulotlarda) — u `true` kabi ishlaydi. Kerak bo'lmasa parametrni umuman qo'shmang.
3. **`DELETE` haqiqiy o'chirish** — mahsulot/kategoriya butunlay yo'qoladi va eski buyurtmalardagi bog'lanish uziladi. Odatiy holatda `PATCH { is_archived: true }` ishlating.
4. **Rolni API orqali o'zgartirib bo'lmaydi** — admin faqat seed yoki baza orqali.
5. **`GET /api/users` va `GET /api/orders/admin/all` da sahifalash yo'q** — ma'lumot ko'paysa sekinlashadi.
6. **Admin boshqa foydalanuvchi nomidan to'lov qila olmaydi** — `POST /api/payments` faqat o'z buyurtmasi uchun.
7. **Logout endpointi yo'q** — tokenlar stateless, chiqish = `localStorage` ni tozalash. Server tomonda tokenni bekor qilib bo'lmaydi (15 daqiqa amal qiladi).
8. **Access token 15 daqiqa** — refresh interceptor bo'lmasa adminka har 15 daqiqada "chiqib ketadi".
9. `POST /api/products` da `category_id` mavjud bo'lmasa **500** qaytadi va `message` ichida Prisma'ning xom xatosi (server fayl yo'llari bilan) keladi — foydalanuvchiga to'g'ridan-to'g'ri ko'rsatmang, formada kategoriyani `select` dan tanlating.
10. **Kategoriya nomi takrorlanishi mumkin** — unikal indeks bazada yo'q (yuqoriga qarang).
11. Narx `Float` — frontendda `Number` bilan yuboring, string emas (`"999.99"` validatsiyadan o'tmaydi).
