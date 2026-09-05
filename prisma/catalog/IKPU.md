# IKPU / MXIK kodlarini to'ldirish

Payme har bir to'lov uchun soliq organiga **fiskal chek** yuboradi va tovar
ma'lumotlarini bizdan so'raydi. Kod bo'lmasa to'lov `-31008` bilan rad etiladi
(pul yechilishidan **oldin** — bu ataylab shunday).

4 ta qiymat kerak:

| Maydon | Nima | Misol | Majburiymi |
| :-- | :-- | :-- | :-- |
| `ikpu_code` | MXIK / IKPU — tovar klassifikatori (17 xona) | `00702001001000000` | ✅ ha |
| `vat_percent` | QQS stavkasi foizda | `12` yoki `0` | ✅ ha (0 ham qiymat) |
| `package_code` | Qadoqlash / birlik kodi | `1508957` | ❌ bo'sh bo'lsa yuborilmaydi |
| `units` | O'lchov birligi kodi (dona = `241092`) | `241092` | ❌ bo'sh bo'lsa yuborilmaydi |

## Qiymatlar KATEGORIYADA turadi

IKPU tovar **guruhiga** beriladi, alohida modelga emas. Shuning uchun kodni
kategoriyaga yozasiz va **ichidagi hamma mahsulot** shuni oladi — 54 ta
mahsulot o'rniga 8 ta qator to'ldiriladi.

```
Product.ikpu_code   bor  →  o'shani ishlatadi   (faqat ISTISNO uchun)
                    yo'q →  Category.ikpu_code
                            yo'q → to'lov -31008 bilan to'xtaydi
```

> `.env` dagi eski `PAYME_DEFAULT_*` zaxirasi **olib tashlangan**. U bitta
> kodni butun katalogga qo'llardi, ya'ni stabilizator ham, payvandlash
> apparati ham «nasos» deb fiskallashardi.

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

## 1.5. Nechta kod kerak?

Kategoriyalaringiz 8 ta, lekin **alohida kod 8 ta emas** — tovar guruhlari
bo'yicha taxminan **5–6 ta**:

| Guruh | Kategoriya | Mahsulot | Izoh |
| :-- | :-- | :-- | :-- |
| A | 1, 2, 3, 5 — nasoslar | 40 ta | Hammasi suv nasosi. Klassifikator ularni ajratsa, A ikkiga bo'linadi. |
| B | 4 — regulyatorlar | 1 ta | |
| C | 6 — kengaytirish baklari | 7 ta | |
| D+E | 7 — asboblar | 4 ta | ⚠️ **Ikkita kod kerak**: payvandlash apparati va elektrodvigatel |
| F | 8 — stabilizatorlar | 2 ta | |

Bir xil guruhdagi kategoriyalarga **bir xil kodni yozib qo'yaverasiz** —
takrorlanishi normal.

**7-kategoriya istisno:** «Инструменты» ichida ikkita boshqa guruh bor.
Kategoriyaga payvandlash apparati kodini yozing, `YL90-L-2` va `YL90L-4`
mahsulotlariga esa alohida elektrodvigatel kodini bering — mahsulotdagi qiymat
kategoriyanikini qoplaydi.

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

### Variant A — skript (tavsiya etiladi)

[`prisma/catalog/ikpu.json`](ikpu.json) ni to'ldiring — 8 kategoriya va 2 ta
mahsulot istisnosi allaqachon ro'yxatda, har birida qidiruv so'zi bilan:

```jsonc
"stabilizatory": {
  "_name": "8. Стабилизаторы (2 ta)",
  "_search": "стабилизатор напряжения",
  "ikpu_code": "00854001001000000",   // ← shu yerga yozasiz
  "package_code": "1508957",
  "vat_percent": 12,
  "units": 241092
}
```

```bash
npm run db:set:ikpu -- --dry-run   # avval rejani ko'ring
npm run db:set:ikpu                # bazaga yozadi
npm run db:check:ikpu              # tekshiradi
```

Skript tekshiradi: `ikpu_code` — **17 xonali raqam**, `vat_percent` — majburiy
(0..100). Xato bo'lsa hech nima yozmaydi va **exit 1** qaytaradi.

`ikpu_code` bo'sh bo'lsa o'sha yozuv **o'tkazib yuboriladi** va bazadagi qiymat
tegilmaydi — ya'ni faylni bosqichma-bosqich to'ldirsangiz ham bo'ladi.

> ⚠️ `db:reset:catalog` kategoriyalarni ham o'chiradi. Toza importdan keyin
> tartib: `db:import:catalog` → **`db:set:ikpu`** → `db:check:ikpu`.

### Variant B — admin panel

`PATCH /api/categories/:id` — 8 ta so'rov va tugadi:

```jsonc
{
  "ikpu_code": "00702001001000000",
  "package_code": "1508957",
  "vat_percent": 12,
  "units": 241092
}
```

7-kategoriyadagi elektrodvigatellar uchun qo'shimcha 2 ta so'rov
`PATCH /api/products/:id` bilan — xuddi shu maydonlar Product DTO'sida ham bor
va kategoriyanikini qoplaydi.

### Variant C — `categories.json` orqali

Aniq kodlarni olganingizdan keyin ularni katalog faylida ham saqlab qo'ysangiz,
toza bazaga import qilganda avtomatik tushadi:

```jsonc
{
  "slug": "avtomaticheskie-nasosy",
  "name": { "uz": "...", "ru": "...", "en": "..." },
  "sort_order": 1,
  "ikpu_code": "00702001001000000",
  "package_code": "1508957",
  "vat_percent": 12,
  "units": 241092
}
```

```bash
npm run db:import:catalog -- --dry-run   # avval rejani ko'ring
npm run db:import:catalog                # bazaga yozing
```

> Maydon JSON'da **umuman bo'lmasa**, import bazadagi qiymatga tegmaydi —
> admin panel orqali kiritgan kodingiz qayta importda o'chib ketmaydi.
> Shuning uchun `categories.json` da ular hozircha yo'q.

Import `slug`/`sku` bo'yicha idempotent — narx, stok, `is_top` va sotuv
statistikasiga tegmaydi.

---

## 4. Tekshirish

```bash
npm run db:check:ikpu
```

Har bir kategoriyani fiskal qiymatlari bilan ko'rsatadi va qaysi mahsulotlarni
**to'lab bo'lmasligini** aytadi. Mahsulot darajasidagi istisnolar `↳` bilan
belgilanadi. Bo'shliq qolsa **non-zero exit** qaytaradi — CI'da ham ishlaydi.

Kategoriyalarda IKPU yo'q bo'lsa server ham bootda ogohlantiradi:

```
[PaymeService] Fiskal ma'lumotsiz kategoriya: Инструменты, Стабилизаторы. ...
```

To'liq integratsiya hujjati: [PAYME_INTEGRATION.md](../../PAYME_INTEGRATION.md)
