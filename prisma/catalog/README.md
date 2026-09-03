# Каталог 2026-III (ООО «OCO»)

Manba: `Каталог 2026-III.pdf` — 21 sahifa, 8 kategoriya, 54 mahsulot.
Kategoriya nomlari PDF ning **2-sahifasidagi «Оглавление»** dan olingan.

| Fayl | Nima |
|---|---|
| `categories.json` | 8 ta kategoriya (2-sahifa tartibida) — katalog **tekis**, ichki kategoriya yo'q |
| `products.json` | 54 ta mahsulot (3–19-sahifalar), `catalog_no` — katalogdagi raqami |
| `generate-from-pdf.py` | JSON larni qayta hosil qiluvchi skript (PDF matnidan transkripsiya) |

## Uch tillilik

Har bir matn maydoni `{uz, ru, en}` obyekti sifatida yoziladi va import paytida
bazadagi `name_uz` / `name_ru` / `name_en` ustunlariga yoyiladi:

```json
{
  "name": { "uz": "Avtomatik suv nasosi 1WZB-250 (alyuminiy)",
            "ru": "Автоматический водяной насос 1WZB-250 (алюминий)",
            "en": "Automatic water pump 1WZB-250 (aluminium)" },
  "attributes": [
    { "key":   { "uz": "Quvvat", "ru": "Мощность", "en": "Power" },
      "value": { "uz": "250", "ru": "250", "en": "250" },
      "unit":  { "uz": "Vt", "ru": "Вт", "en": "W" } }
  ]
}
```

Asl manba rus tilida, o'zbekcha va inglizcha variantlar `generate-from-pdf.py`
dagi lug'atlardan hosil qilinadi. Sonli qiymatlar uchala tilda bir xil, faqat
matnli qiymatlar (`Медный` / `Mis` / `Copper`) tarjima qilinadi.

## Yuklash

```bash
npx prisma db push && npx prisma generate
```

```bash
npm run db:import:catalog -- --dry-run
```

```bash
npm run db:import:catalog
```

Skript **idempotent**: kalit sifatida `sku` (topilmasa `slug`) ishlatiladi, shuning uchun
qayta ishga tushirsangiz nusxa yaratmaydi.

### Bayroqlar

| Bayroq | Ta'siri |
|---|---|
| `--dry-run` | Bazaga yozmaydi, faqat rejani chiqaradi |
| `--reset-pricing` | Mavjud mahsulotlarning narx/zaxira/bayroqlarini ham katalog holatiga qaytaradi |
| `--archive-missing` | Katalog kategoriyalarida turgan, importda uchramagan mahsulotlarni arxivlaydi |
| `--dir <yo'l>` | Boshqa papkadagi JSON larni o'qiydi |

**Muhim:** oddiy (bayroqsiz) qayta import faqat katalog maydonlarini — nom, tavsif,
brend, teglar, xarakteristikalar, kategoriya — yangilaydi. Admin panelda qo'yilgan
`price`, `stock`, `is_top`, `is_featured`, reyting va sotuv statistikasi **tegilmaydi**.

## Narxlar

Katalogda birorta ham narx ko'rsatilmagan. Shu sababli 54 ta mahsulotning barchasi
`price_on_request: true` va `stock: 0` bilan yuklanadi:

- savatga qo'shib bo'lmaydi va buyurtma qilib bo'lmaydi (`400` qaytadi);
- narx fasetiga (`facets.price`) ta'sir qilmaydi;
- `?price_on_request=false` filtri bilan ro'yxatdan chiqarib tashlash mumkin.

Narxlar ma'lum bo'lgach: `products.json` da `price` ni to'ldirib
`price_on_request` ni `false` qiling va `--reset-pricing` bilan importni takrorlang,
yoki narxlarni admin panel orqali kiriting.

## Rasmlar

PDF dagi rasmlar ajratib olinmagan — hamma mahsulotda `images: []`. Rasmlarni
`POST /api/upload` orqali yuklab, qaytgan yo'lni `products.json` ga yozing yoki
admin paneldan biriktiring.

## Katalogdagi ziddiyatli ma'lumotlar

Quyidagilar PDF da **qanday bo'lsa shundayligicha** ko'chirilgan — o'zboshimchalik
bilan "tuzatilmagan". Sotuvchi bilan aniqlashtirish kerak:

| № | Model | Katalogdagi holat | JSON da nima yozilgan |
|---|---|---|---|
| 17 | QDX 15-17-0.55F | 550 Вт uchun «15 м³/ч» juda katta (nomiga ko'ra 1.5 bo'lishi mumkin) | **15** — o'zgartirilmadi |
| 19 | QDX 40-6-1.1 | Nomida `40-6`, jadvalda напор 12 м va 45 м³/ч | **jadvaldagi** qiymatlar |
| 29 | CPM 158 | «Мощность,**W** 0,75» | **750 Вт** (0.75 кВт deb o'qildi) |
| 35 | EPC-1 | Birinchi qatorning nomi yo'q, faqat «1,1» | **Мощность 1,1 кВт** deb olindi |
| 36–39 | RS seriyasi | «Пропускная способность, м3/**мин**» | **м³/ч** — 46–97 Вт nasos uchun м³/мин fizik jihatdan imkonsiz |
| 44 | Tank 19V | «Ёмкость **8 л**» — nomiga ko'ra 19 л bo'lishi kerak | **8 л** — o'zgartirilmadi |
| 48 | Tank 50 V | «Ёмкость **36 л**» — nomiga ko'ra 50 л bo'lishi kerak | **36 л** — o'zgartirilmadi |
| 52 | YL90-L-2 | «Мощность,Kw 3» ikki marta takrorlangan | bir marta yozildi |
| ko'p joyda | — | «Частота **ГГц** 50», «Напряжение сети 220 **Вт**» | **Гц** va **В** — aniq terish xatosi |
| 21, 51, 52 | QDX 150-11-5.5, YL90L-4, YL90-L-2 | «Бренд» qatori yo'q | `brand: "OCO"` (butun katalog OCO) |

**Qoida:** o'lchov birligidagi aniq terish xatolari (ГГц, Вт) to'g'rilangan, lekin
**sonli qiymatlar hech qachon o'zgartirilmagan** — ular bilan sotuvchi aniqlik
kiritishi kerak.

### Bir model — ikki material

Katalogda bir nechta model ikki xil materialda takrorlanadi. SKU bazada unikal
bo'lishi shart, shuning uchun ularga material kodi qo'shilgan:

| № | Model | SKU |
|---|---|---|
| 24 / 25 | QB-60 (alyuminiy / mis) | `QB-60-AL` / `QB-60-CU` |
| 30 / 32 | JET 750 (alyuminiy / mis) | `JET-750-AL` / `JET-750-CU` |
| 31 / 33 | JET 1100 (alyuminiy / mis) | `JET-1100-AL` / `JET-1100-CU` |
| 40 / 41 | LPS 15-9 Z (—/ latun) | `LPS-15-9-Z` / `LPS-15-9-Z-BR` |
