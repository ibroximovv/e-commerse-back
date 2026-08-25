# Loyihadagi O'zgarishlar va Senior Darajadagi Optimizatsiyalar (Backend)

Ushbu hujjat e-commerce backend loyihasidagi barcha ortiqcha kodlarni olib tashlash, arxitekturani optimallashtirish, xavfsizlikni kuchaytirish va yangi enterprise imkoniyatlarni qo'shish bo'yicha qilingan to'liq o'zgarishlarni o'z ichiga oladi.

---

## 1. Ortiqcha va Keraksiz Kodlarni Tozalash (Cleanup)

1. **Frontend bog'liqliklarini olib tashlash (`package.json`):**
   - Backend API uchun keraksiz bo'lgan `react`, `react-dom`, `dgz-ui-shared` paketlari `package.json` dan butunlay olib tashlandi.
2. **Bo'sh va ishlatilmayotgan CLI stub fayllarni tozalash:**
   - Nest CLI tomonidan generatsiya qilingan, ichi bo'sh va hech qayerda import qilinmagan fayllar va entitiylar o'chirildi:
     - `src/api/auth/dto/create-auth.dto.ts`, `src/api/auth/dto/update-auth.dto.ts`, `src/api/auth/entities/auth.entity.ts`
     - `src/api/carts/dto/create-cart.dto.ts`, `src/api/carts/dto/update-cart.dto.ts`, `src/api/carts/entities/cart.entity.ts`
     - `src/api/categories/entities/category.entity.ts`
     - `src/api/orders/dto/create-order.dto.ts`, `src/api/orders/dto/update-order.dto.ts`, `src/api/orders/entities/order.entity.ts`
     - `src/api/payments/dto/create-payment.dto.ts`, `src/api/payments/dto/update-payment.dto.ts`, `src/api/payments/entities/payment.entity.ts`
     - `src/api/products/entities/product.entity.ts`
     - `src/api/users/dto/create-user.dto.ts`, `src/api/users/entities/user.entity.ts`
3. **Ildizdagi bo'sh `e-commerse-back` papkasi o'chirildi.**

---

## 2. Ma'lumotlar Bazasi Modeli (`prisma/schema.prisma`) Kengaytirilishi

- **`Order` modeliga yangi maydonlar qo'shildi:**
  - `shipping_address String?` — Yetkazib berish manzili
  - `customer_phone String?` — Qabul qiluvchi telefon raqami
  - `customer_name String?` — Qabul qiluvchi ismi
  - `notes String?` — Buyurtma bo'yicha mijoz izohi / kuryer uchun eslatma
  - `payment_method String?` — To'lov usuli (masalan: `CASH`, `CLICK`, `PAYME`, `STRIPE`)
- Barcha `id` lar MongoDB talabiga ko'ra UUID `@map("_id")` bo'lib saqlangan, Prisma v6 talablariga to'liq rioya qilingan.

---

## 3. Autentifikatsiya va Xavfsizlik (Auth Module)

1. **Parolni Tiklash (Forgot & Reset Password with OTP):**
   - `POST /api/auth/forgot-password`: Emailga 6 xonali CSPRNG OTP yuboradi (10 daqiqa amal qiladi, 1 daqiqalik cooldown bilan).
   - `POST /api/auth/reset-password`: 6 xonali kodni tekshirib yangi parolni xavfsiz bcrypt bilan xeshlaydi.
2. **Login Javobi Kengaytirildi:**
   - Endilikda `POST /api/auth/login` faqat tokenlarni emas, foydalanuvchi ma'lumotlarini ham qaytaradi (`user: { id, email, full_name, role, phone, photo, language, is_verified, created_at, updated_at }`). Frontend login bo'lishi bilan qo'shimcha so'rov yuborishi shart emas.
3. **Stateless Logout:**
   - `POST /api/auth/logout` Swagger'da hujjatlashtirilgan toza chiqish javobini taqdim etadi.

---

## 4. Foydalanuvchilar Boshqaruvi (Users Module)

1. **Sahifalash, Qidiruv va Rol Filtr (`GET /api/users`):**
   - Adminlar uchun foydalanuvchilar ro'yxati to'liq sahifalash (`page`, `limit`), matnli qidiruv (`search` — email, full_name, phone) va rol bo'yicha filtr (`role=ADMIN|USER`) bilan boyitildi.
2. **Rolni O'zgartirish Endpointi (`PATCH /api/users/:id/role`):**
   - Adminlar foydalanuvchini `ADMIN` yoki `USER` roliga o'tkazish imkoniyatiga ega bo'ldi.
3. **Foydalanuvchilar Statistikasi (`GET /api/users/stats`):**
   - Jami foydalanuvchilar, tasdiqlanganlar, adminlar va oddiy foydalanuvchilar soni.

---

## 5. Buyurtmalar Tizimi (Orders Module)

1. **Yetkazib Berish Ma'lumotlari bilan Checkout:**
   - `POST /api/orders/checkout` endpointi endi ixtiyoriy `CheckoutDto` qabul qiladi (`shipping_address`, `customer_phone`, `customer_name`, `notes`, `payment_method`).
2. **Admin uchun Kengaytirilgan Buyurtmalar Ro'yxati (`GET /api/orders/admin/all`):**
   - `page`, `limit`, `status` (`PENDING`, `CONFIRMED`, `SHIPPED`, `DELIVERED`, `CANCELLED`), sana oralig'i (`start_date`, `end_date`), summa oralig'i (`min_amount`, `max_amount`) va qidiruv (`search`) bo'yicha sahifalangan buyurtmalar ro'yxati.
3. **Buyurtmani Bekor Qilish (`PATCH /api/orders/:id/cancel`):**
   - Oddiy mijoz o'zining `PENDING` holatidagi buyurtmasini bekor qila oladi; Admin istalgan buyurtmani bekor qila oladi.
   - Bekor qilinganda atomik tranzaksiyada mahsulot zaxirasi (`stock`) qaytariladi va sotuv statistikasi (`sales_count`, `popularity_score`) avtomatik kamaytiriladi.

---

## 6. Admin Dashboard & Analitika Moduli (`src/api/dashboard/`)

Yangi `DashboardModule` yaratildi:
- **`GET /api/dashboard/stats` (Faqat ADMIN):**
  - **Daromad (`revenue`):** Jami daromad va to'langan daromad.
  - **Buyurtmalar holati (`orders`):** Jami, kutilayotgan, tasdiqlangan, yo'lda, yetkazilgan va bekor qilinganlar soni.
  - **Mahsulotlar holati (`products`):** Faol mahsulotlar, arxivlanganlar, tugaganlar (`stock=0`), kam qolganlar (`stock <= 5`).
  - **Foydalanuvchilar (`users`):** Jami va tasdiqlangan foydalanuvchilar.
  - **Oylik savdo grafigi (`monthly_sales`):** Oxirgi 6 oylik oylik daromad va buyurtmalar soni dinamikasi.
  - **So'nggi buyurtmalar (`recent_orders`):** Oxirgi 5 ta buyurtma ma'lumotlari.
  - **Top mahsulotlar (`top_products`):** Eng ko'p sotilgan va yuqori reytingli 5 ta mahsulot.

---

## 7. To'lovlar Tizimi (Payments Module)

1. **Admin To'lovlar Ro'yxati (`GET /api/payments/admin/all`):**
   - Status (`PENDING`, `SUCCESSFUL`, `FAILED`, `REFUNDED`), provayder (`provider`) va qidiruv (`search`) bo'yicha sahifalangan to'lovlar monitoringi.

---

## 8. Fayllar Yuklash Tizimi (Upload Module)

1. **Bir Nechta Fayllarni Yuklash (`POST /api/upload/multiple`):**
   - Mahsulot galereyasi uchun bir vaqtning o'zida 10 tagacha rasm yuklash imkoniyati (`urls: string[]`).
2. **Faylni Xavfsiz O'chirish (`DELETE /api/upload?path=...`):**
   - Keraksiz rasmlarni server diskidan o'chirish. Path traversal (`../`) xurujlaridan to'liq himoyalangan.
3. **MIME Type va Hajm:**
   - SVG formati qo'shildi, har bir fayl uchun limit 10MB ga oshirildi.

---

## 9. Tizim Salomatligi va Monitoring (`AppController`)

- `GET /` va `GET /api/health`:
  - API holati, uptime, MongoDB ulanishi tekshiruvi, versiya va vaqt tamg'asini qaytaruvchi enterprise health-check.

---

## 10. Ko'p Tillilik (i18n & Translations)

- Yangi xabarlar va xatoliklar (`uz`, `ru`) tarjima lug'atiga qo'shildi.
