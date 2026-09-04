# Каталог 2026-III (ООО «OCO»)

Manba: `Каталог 2026-III.pdf` — 21 sahifa, 8 kategoriya, 54 mahsulot.
Kategoriya nomlari PDF ning **2-sahifasidagi «Оглавление»** dan olingan.

| Fayl | Nima |
|---|---|
| `categories.json` | 8 ta kategoriya (2-sahifa tartibida) — katalog **tekis**, ichki kategoriya yo'q |
| `products.json` | 54 ta mahsulot (3–19-sahifalar), `catalog_no` — katalogdagi raqami |
| `generate-from-pdf.py` | JSON larni qayta hosil qiluvchi skript (PDF matnidan transkripsiya) |
| `images/` | Mahsulot suratlari (PDF dan ajratilgan, 55 ta `.jpg`) |
| `images.map.json` | PDF dagi rasm obyekti → SKU jadvali (qo'lda tekshirilgan) |

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

### Eski ma'lumotlar ustiga toza yuklash

Bazada boshqa (test yoki eski) katalog bo'lsa, avval uni tozalang. Skript
foydalanuvchilarga **tegmaydi** — admin hisobingiz saqlanadi:

```bash
npm run db:reset:catalog                            # faqat hisobot
npm run db:reset:catalog -- --yes                   # katalog + savat + sharhlar
npm run db:reset:catalog -- --yes --with-orders     # buyurtmalar ham
npm run db:import:catalog
```

Buyurtmalar mavjud bo'lsa skript `--with-orders` siz **to'xtaydi**: MongoDB da
tashqi kalitlar majburlanmaydi, ya'ni mahsulotni o'chirsak buyurtma qatori
mavjud bo'lmagan mahsulotga ishora qilib qoladi va o'sha buyurtmani ochish
xatolik beradi. Buyurtma tarixini saqlash kerak bo'lsa o'chirish o'rniga
`npm run db:import:catalog -- --archive-missing` bilan arxivlang.

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

Barcha 54 mahsulotning surati PDF dan ajratib olingan va `images/` papkasida
yotadi (55 ta `.jpg`, ~1.2 MB). `uploads/` git da kuzatilmaydi, shuning uchun
suratlar repoda shu yerda saqlanadi va **import paytida** `uploads/catalog/`
ga ko'chiriladi — yangi serverda alohida ish qilish shart emas.

Qayta ajratish (PDF yangilansa):

```bash
sudo apt install poppler-utils imagemagick     # bir marta, faqat lokalda
npm run catalog:images -- "/path/Каталог 2026-III.pdf"
```

Skript `images.map.json` dagi jadval bo'yicha ishlaydi. **Jadval qo'lda
tuzilgan va tekshirilgan**, chunki PDF ichida rasm obyektlarining tartibi
sahifadagi ko'rinish tartibiga mos kelmaydi:

- 5-sahifada rasmlar teskari saqlangan (XP-300 PW-1100 dan oldin keladi);
- 13-, 14-, 16-sahifalarda tartib aralash;
- 45-mahsulot (Tank 24V W) katalogda **uchta** rangdagi bak bilan ko'rsatilgan
  — unda 3 ta rasm bor;
- 51 va 52 (YL90L-4, YL90-L-2) katalogda **bitta** suratni bo'lishadi;
- bir nechta surat PDF da shaffoflik niqobi (smask) bilan saqlangan — niqobsiz
  ular qop-qora fonda chiqadi, skript niqobni oq fonga birlashtiradi.

PDF yangi nashri kelsa jadvalni qayta tekshirish kerak: obyekt raqamlari
o'zgaradi va skript mos kelmasa xato bilan to'xtaydi.

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
