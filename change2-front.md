# Frontend Dasturchilar Uchun API Qo'llanmasi va O'zgarishlar (change2-front.md)

> ## ⚠️ BU HUJJAT ESKIRGAN
>
> Katalog OCO «Каталог 2026-III» ga moslashtirilgandan keyin API jiddiy
> o'zgardi. Quyidagilar bu yerda **noto'g'ri** yozilgan:
>
> - `Product.name` / `description` endi bitta satr emas — uch tilda saqlanadi;
> - `attributes` elementi `{key, value}` emas — `{key, value, unit}`, har biri 3 tilli;
> - `POST /api/payments` **o'chirilgan** → `POST /api/payments/checkout`;
> - `payment.transaction_id` → `payment.payme_transaction_id`;
> - `provider` faqat `payme` (CLICK yo'q);
> - javob konvertida `message`/`meta` `null` emas — bo'lmasa **umuman yo'q**,
>   va yangi `language` maydoni bor;
> - kategoriya daraxti (`parent_id`, `/tree`, breadcrumbs) olib tashlangan;
> - `Product` da yangi fiskalizatsiya maydonlari bor.
>
> **Joriy hujjat: [front.md](./front.md)**
>
> Bu fayl faqat tarix uchun qoldirilgan. Yangi ish uchun `front.md` ni o'qing.

Bu qo'llanma React, Next.js, Vue yoki mobil ilova dasturchilari uchun yangilangan API endpointlari, DTOlar, javob formatlari va qulay namunalarni taqdim etadi.

---

## 1. Asosiy Qoidalar va Formatlar

- **Base URL:** `http://localhost:3000`
- **Swagger Docs:** `http://localhost:3000/api/docs`
- **Statik Fayllar:** `http://localhost:3000/uploads/<fayl_nomi>`
- **Javob Konverti:** Barcha muvaffaqiyatli so'rovlar quyidagi standart formatda qaytadi:
  ```json
  {
    "success": true,
    "data": { /* ma'lumot */ },
    "message": null,
    "meta": null /* faqat sahifalangan ro'yxatlarda to'ladi */
  }
  ```

---

## 2. Yangi va Yangilangan Endpointlar Ro'yxati

### 🔐 1. Autentifikatsiya (`/api/auth`)

| Metod | Yo'l | Ruxsat | Body | Tavsif |
|---|---|---|---|---|
| POST | `/api/auth/login` | Ochiq | `{ email, password }` | **Yangilandi:** Endi `{ user, access_token, refresh_token }` qaytaradi |
| POST | `/api/auth/forgot-password` | Ochiq | `{ email }` | **Yangi:** Parolni unutganda 6 xonali OTP yuboradi |
| POST | `/api/auth/reset-password` | Ochiq | `{ email, code, new_password }` | **Yangi:** 6 xonali kod bilan yangi parol o'rnatadi |
| POST | `/api/auth/logout` | Ochiq | — | **Yangi:** Tizimdan chiqish |
| POST | `/api/auth/refresh` | Ochiq | `{ refresh_token }` | Tokenlarni yangilash |
| POST | `/api/auth/change-password` | 🔑 Token | `{ old_password, new_password }` | Joriy parolni o'zgartirish |

#### Login Javobi Namunasi:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-v4-string",
      "email": "user@example.com",
      "full_name": "Ali Valiyev",
      "role": "USER",
      "phone": "+998901234567",
      "photo": "uploads/1712345678-123.png",
      "language": "uz",
      "is_verified": true,
      "created_at": "2026-08-25T10:00:00.000Z",
      "updated_at": "2026-08-25T10:00:00.000Z"
    },
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi..."
  }
}
```

---

### 📊 2. Admin Dashboard & Analitika (`/api/dashboard`)

| Metod | Yo'l | Ruxsat | Tavsif |
|---|---|---|---|
| GET | `/api/dashboard/stats` | 👑 Faqat ADMIN | Barcha asosiy ko'rsatkichlar va savdo dinamikasi |

#### Dashboard Javobi Namunasi:
```json
{
  "success": true,
  "data": {
    "revenue": {
      "total_revenue": 15420.50,
      "paid_revenue": 12300.00
    },
    "orders": {
      "total": 45,
      "pending": 8,
      "confirmed": 12,
      "shipped": 5,
      "delivered": 18,
      "cancelled": 2
    },
    "products": {
      "total_active": 120,
      "archived": 5,
      "out_of_stock": 3,
      "low_stock": 8
    },
    "users": {
      "total_users": 85,
      "verified_users": 79
    },
    "monthly_sales": [
      { "month": "2026-03", "revenue": 1800.0, "orders": 6 },
      { "month": "2026-04", "revenue": 2400.0, "orders": 8 },
      { "month": "2026-05", "revenue": 3100.5, "orders": 10 },
      { "month": "2026-06", "revenue": 2900.0, "orders": 9 },
      { "month": "2026-07", "revenue": 3800.0, "orders": 12 },
      { "month": "2026-08", "revenue": 1420.0, "orders": 5 }
    ],
    "recent_orders": [ /* oxirgi 5 ta buyurtma */ ],
    "top_products": [ /* eng ko'p sotilgan 5 ta mahsulot */ ]
  }
}
```

---

### 📦 3. Buyurtmalar (`/api/orders`)

| Metod | Yo'l | Ruxsat | Body / Query | Tavsif |
|---|---|---|---|---|
| POST | `/api/orders/checkout` | 🔑 Token | `{ shipping_address?, customer_phone?, customer_name?, notes?, payment_method? }` | **Yangilandi:** Savatdan buyurtma yaratish va manzil kiritish |
| PATCH | `/api/orders/:id/cancel` | 🔑 Token | — | **Yangi:** Buyurtmani bekor qilish (mijoz `PENDING` ni, admin istalganini bekor qila oladi) |
| GET | `/api/orders/admin/all` | 👑 Faqat ADMIN | `?page=1&limit=10&status=PENDING&search=ali&start_date=2026-01-01` | **Yangilandi:** Sahifalash, status va sana filtrlari |
| GET | `/api/orders` | 🔑 Token | `?archived=true` | Joriy foydalanuvchi buyurtmalari |
| GET | `/api/orders/:id` | 🔑 Token | — | Bitta buyurtma detallari |
| PATCH | `/api/orders/:id/status` | 👑 Faqat ADMIN | `{ "status": "SHIPPED" }` | Buyurtma statusini o'zgartirish |
| PATCH | `/api/orders/:id/archive` | 🔑 Token | — | Buyurtmani arxivlash/yashirish |

#### Checkout Body Namunasi:
```json
{
  "shipping_address": "Toshkent shahri, Chilonzor 9-mavze, 12-uy",
  "customer_phone": "+998901234567",
  "customer_name": "Ali Valiyev",
  "notes": "Iltimos, soat 18:00 dan keyin yetkazing",
  "payment_method": "CLICK"
}
```

---

### 👥 4. Foydalanuvchilar (`/api/users`)

| Metod | Yo'l | Ruxsat | Query / Body | Tavsif |
|---|---|---|---|---|
| GET | `/api/users` | 👑 Faqat ADMIN | `?page=1&limit=10&role=USER&search=ali` | **Yangilandi:** Sahifalangan ro'yxat, rol va qidiruv |
| GET | `/api/users/stats` | 👑 Faqat ADMIN | — | **Yangi:** Foydalanuvchilar statistikasi |
| PATCH | `/api/users/:id/role` | 👑 Faqat ADMIN | `{ "role": "ADMIN" }` | **Yangi:** Foydalanuvchi rolini o'zgartirish |
| GET | `/api/users/profile` | 🔑 Token | — | Joriy foydalanuvchi profili |
| PATCH | `/api/users/profile` | 🔑 Token | `{ full_name?, phone?, photo?, language? }` | Profilni yangilash |
| GET | `/api/users/:id` | 👑 Faqat ADMIN | — | ID orqali olish |
| DELETE | `/api/users/:id` | 👑 Faqat ADMIN | — | Foydalanuvchini o'chirish |

---

### 💳 5. To'lovlar (`/api/payments`)

| Metod | Yo'l | Ruxsat | Query / Body | Tavsif |
|---|---|---|---|---|
| GET | `/api/payments/admin/all` | 👑 Faqat ADMIN | `?page=1&limit=10&status=SUCCESSFUL&provider=CLICK` | **Yangi:** Barcha to'lovlar monitoringi (sahifalangan) |
| GET | `/api/payments/status/:order_id` | 🔑 Token | — | Buyurtma to'lov holati |
| POST | `/api/payments` | 🔑 Token | `{ order_id, provider }` | Buyurtmani to'lash |

---

### 📁 6. Fayllar Yuklash (`/api/upload`)

| Metod | Yo'l | Ruxsat | Form-Data | Tavsif |
|---|---|---|---|---|
| POST | `/api/upload` | 🔑 Token | `file` (bitta fayl) | Yagona rasm yuklash (10MB gacha) |
| POST | `/api/upload/multiple` | 🔑 Token | `files` (10 tagacha) | **Yangi:** Galereya uchun ko'p fayl yuklash |
| DELETE | `/api/upload` | 🔑 Token | `?path=uploads/1712345678-123.png` | **Yangi:** Yuklangan faylni serverdan o'chirish |

#### Ko'p fayl yuklash javobi:
```json
{
  "success": true,
  "data": {
    "message": "3 file(s) uploaded successfully",
    "urls": [
      "uploads/1712345678-101.png",
      "uploads/1712345678-102.png",
      "uploads/1712345678-103.png"
    ]
  }
}
```

---

### 💚 7. Tizim Monitoringi

| Metod | Yo'l | Ruxsat | Tavsif |
|---|---|---|---|
| GET | `/api/health` yoki `/` | Ochiq | Server va DB holati, uptime |

---

## 3. TypeScript Tiplar (Frontend uchun tayyor)

```typescript
export type Role = 'ADMIN' | 'USER';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  photo?: string;
  role: Role;
  is_verified: boolean;
  language: 'uz' | 'ru' | 'en';
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku?: string;
  description?: string;
  brand?: string;
  tags: string[];
  price: number;
  discount_price?: number | null;
  final_price: number;
  discount_percent: number;
  stock: number;
  images: string[];
  is_archived: boolean;
  is_top: boolean;
  is_featured: boolean;
  sales_count: number;
  view_count: number;
  rating: number;
  rating_count: number;
  popularity_score: number;
  category_id: string;
  attributes: { key: string; value: string }[];
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  user?: User;
  total_amount: number;
  status: OrderStatus;
  shipping_address?: string;
  customer_phone?: string;
  customer_name?: string;
  notes?: string;
  payment_method?: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  items: {
    id: string;
    product_id: string;
    product: Product;
    quantity: number;
    price_at_purchase: number;
  }[];
  payment?: {
    id: string;
    amount: number;
    provider: string;
    status: PaymentStatus;
    transaction_id?: string;
  };
}

export interface DashboardStats {
  revenue: {
    total_revenue: number;
    paid_revenue: number;
  };
  orders: {
    total: number;
    pending: number;
    confirmed: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  };
  products: {
    total_active: number;
    archived: number;
    out_of_stock: number;
    low_stock: number;
  };
  users: {
    total_users: number;
    verified_users: number;
  };
  monthly_sales: {
    month: string;
    revenue: number;
    orders: number;
  }[];
  recent_orders: Order[];
  top_products: Product[];
}
```
