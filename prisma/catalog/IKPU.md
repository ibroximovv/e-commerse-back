# IKPU / MXIK kodlarini to'ldirish

Payme har bir to'lov uchun soliq organiga **fiskal chek** yuboradi va tovar
ma'lumotlarini bizdan so'raydi. Kod bo'lmasa to'lov `-31008` bilan rad etiladi
(pul yechilishidan **oldin** — bu ataylab shunday).

Har bir mahsulot uchun 4 ta qiymat kerak:

| Maydon | Nima | Misol | Majburiymi |
| :-- | :-- | :-- | :-- |
| `ikpu_code` | MXIK / IKPU — tovar klassifikatori (17 xona) | `00702001001000000` | ✅ ha |
| `vat_percent` | QQS stavkasi foizda | `12` yoki `0` | ✅ ha (0 ham qiymat) |
| `package_code` | Qadoqlash / birlik kodi | `1508957` | ❌ bo'sh bo'lsa yuborilmaydi |
| `units` | O'lchov birligi kodi (dona = `241092`) | `241092` | ❌ bo'sh bo'lsa yuborilmaydi |

---

## 1. Kodlarni qayerdan olasiz

**Bularni Payme bermaydi** — bu soliq organining klassifikatori.

1. <https://tasnif.soliq.uz> ni oching → qidiruv maydoniga tovar nomini
   **rus tilida** yozing (baza asosan ruscha: `насос`, `бак`, `стабилизатор`).
2. Chiqqan ro'yxatdan tovaringizga eng mos qatorni tanlang → **17 xonali MXIK
   kodi** ko'rinadi.
3. Kod tanlangach o'sha sahifada **qadoqlash turlari** (`package_code`) ro'yxati
   chiqadi — o'zingiznikini tanlang (odatda «дона / штука»).
4. `units` — o'lchov birligi; dona uchun `241092`.
5. `vat_percent` — **buxgalteringizdan so'rang**: QQS to'lovchisi bo'lsangiz `12`,
   bo'lmasangiz `0`.

> 💡 Qidiruv ochiq, ro'yxatdan o'tish shart emas. Agar sayt kirishni so'rasa —
> <https://my.soliq.uz> kabinetidan ham xuddi shu klassifikatorni topasiz.
>
> ⚠️ Yakuniy kodlarni **buxgalter yoki soliq maslahatchisi tasdiqlasin**.
> Noto'g'ri MXIK — soliq jarimasi. Payme menejeri ham odatda maslahat beradi.

---

## 2. To'ldirish jadvali (8 kategoriya, 54 mahsulot)

O'ng ustunlarni to'ldiring, keyin 3-bo'limga o'ting.

### 1. Автоматические насосы — Avtomatik nasoslar (14 ta)

`tasnif.soliq.uz` da qidiring: **`насос водяной`**, `насос центробежный бытовой`

SKU: `1WZB-250`, `1WZB-370`, `1WZB-550`, `1WZB-750`, `WZB-300A`, `WZB-400A`,
`PW-250`, `PW-370`, `PW-550`, `PW-750`, `PW-1100`, `PW-250-SMART`,
`PW-370-SMART`, `XP-300`

| ikpu_code | package_code | vat_percent | units |
| :-- | :-- | :-- | :-- |
| | | | |

### 2. Погружные насосы — Botiriladigan nasoslar (9 ta)

Qidiring: **`насос погружной`**, `насос дренажный`, `насос фекальный`

SKU: `QDX-1.5-12-0.25F`, `QDX-1.5-16-0.37`, `QDX-1.5-16-0.37F`,
`QDX-1.5-32-1.1`, `QDX-15-17-0.55F`, `QDX-30-6-0.75F`, `QDX-40-6-1.1`,
`QDX-100-12-3.5`, `QDX-150-11-5.5`

| ikpu_code | package_code | vat_percent | units |
| :-- | :-- | :-- | :-- |
| | | | |

### 3. Поверхностные насосы — Yer usti nasoslari (11 ta)

Qidiring: **`насос поверхностный`**, `насос центробежный`, `насос самовсасывающий`

SKU: `QB-60-AL`, `QB-60-CU`, `QB-70`, `CPM-130`, `CPM-146`, `CPM-158`,
`JET-750-AL`, `JET-750-CU`, `JET-1100-AL`, `JET-1100-CU`, `JET-1100A`

| ikpu_code | package_code | vat_percent | units |
| :-- | :-- | :-- | :-- |
| | | | |

### 4. Автоматические регуляторы — Avtomatik regulyatorlar (1 ta)

Qidiring: **`реле давления`**, `регулятор давления воды`

SKU: `EPC-1`

| ikpu_code | package_code | vat_percent | units |
| :-- | :-- | :-- | :-- |
| | | | |

### 5. Циркуляционные насосы — Sirkulyatsion nasoslar (6 ta)

Qidiring: **`насос циркуляционный`**

SKU: `LPS-15-9-Z`, `LPS-15-9-Z-BR`, `RS-25-6-180`, `RS-25-8-180`,
`RS-32-6-180`, `RS-32-8-180`

| ikpu_code | package_code | vat_percent | units |
| :-- | :-- | :-- | :-- |
| | | | |

### 6. Расширительный бак — Kengaytirish baklari (7 ta)

Qidiring: **`бак расширительный`**, `гидроаккумулятор`

SKU: `TANK-8V`, `TANK-12V`, `TANK-19V`, `TANK-24V-L`, `TANK-24V-W`,
`TANK-36V`, `TANK-50V`

| ikpu_code | package_code | vat_percent | units |
| :-- | :-- | :-- | :-- |
| | | | |

### 7. Инструменты — Asboblar (4 ta)

⚠️ Bu kategoriyada tovarlar **turlicha** — har biriga alohida kod kerak
bo'lishi mumkin.

- `MIG-300`, `MIG-400` — qidiring: **`аппарат сварочный`**
- `YL90-L-2`, `YL90L-4` — qidiring: **`электродвигатель асинхронный`**

| SKU | ikpu_code | package_code | vat_percent | units |
| :-- | :-- | :-- | :-- | :-- |
| MIG-300 | | | | |
| MIG-400 | | | | |
| YL90-L-2 | | | | |
| YL90L-4 | | | | |

### 8. Стабилизаторы — Stabilizatorlar (2 ta)

Qidiring: **`стабилизатор напряжения`**

SKU: `DNB-1000-VA`, `DNB-2000-VA`

| ikpu_code | package_code | vat_percent | units |
| :-- | :-- | :-- | :-- |
| | | | |

---

## 3. Kodlarni loyihaga kiritish

Ikki daraja bor: **mahsulotdagi qiymat** ustunroq, u bo'sh bo'lsa `.env` dagi
`PAYME_DEFAULT_*` ishlatiladi.

### Variant A — ommaviy (tavsiya etiladi)

`prisma/catalog/products.json` dagi har bir mahsulotga 4 ta maydon qo'shing:

```jsonc
{
  "catalog_no": 1,
  "sku": "1WZB-250",
  "category": "avtomaticheskie-nasosy",
  // ...
  "ikpu_code": "00702001001000000",
  "package_code": "1508957",
  "vat_percent": 12,
  "units": 241092
}
```

Keyin:

```bash
npm run db:import:catalog -- --dry-run   # avval rejani ko'ring
npm run db:import:catalog                # bazaga yozing
```

Import `sku` bo'yicha idempotent — narx, stok, `is_top` va sotuv statistikasiga
tegmaydi.

### Variant B — bittalab

Admin panel orqali mahsulotni tahrirlash (`PATCH /api/products/:id`) —
`ikpu_code`, `package_code`, `vat_percent`, `units` maydonlari DTO'da bor.

### Zaxira qiymat (`.env`)

Eng ko'p uchraydigan guruh kodini (nasoslar — 40+ mahsulot) `.env` ga yozing:

```env
PAYME_DEFAULT_IKPU_CODE="..."
PAYME_DEFAULT_PACKAGE_CODE="..."
PAYME_DEFAULT_VAT_PERCENT=12
PAYME_DEFAULT_UNITS=241092
```

---

## 4. Tekshirish

```bash
npm run db:check:ikpu
```

Skript bazadagi barcha faol mahsulotlarni kategoriya bo'yicha ko'rsatadi va
qaysilarida fiskal maydon yetishmayotganini aytadi. Yakunda `.env` zaxirasi
bo'shliqni yopadimi-yo'qmi — shuni ham xabar qiladi.

To'liq integratsiya hujjati: [PAYME_INTEGRATION.md](../../PAYME_INTEGRATION.md)
