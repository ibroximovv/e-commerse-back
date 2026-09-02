# Каталог 2026-III (ООО «OCO»)

Manba: `Каталог 2026-III.pdf` — 21 sahifa, 8 kategoriya, 54 mahsulot.
Kategoriya nomlari PDF ning **2-sahifasidagi «Оглавление»** dan olingan.

| Fayl | Nima |
|---|---|
| `categories.json` | 8 ta ildiz kategoriya (2-sahifa tartibida) |
| `products.json` | 54 ta mahsulot (3–19-sahifalar), `catalog_no` — katalogdagi raqami |
| `generate-from-pdf.py` | JSON larni qayta hosil qiluvchi skript (PDF matnidan transkripsiya) |

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

| № | Model | Muammo |
|---|---|---|
| 17 | QDX 15-17-0.55F | 550 Вт uchun 15 м³/ч juda katta (nomiga ko'ra 1.5 bo'lishi mumkin) |
| 19 | QDX 40-6-1.1 | Nomida `40-6`, jadvalda esa напор 12 м va 45 м³/ч |
| 29 | CPM 158 | «Мощность,W **0,75**» — aslida 0.75 кВт = 750 Вт. JSON da `750 Вт` qilib yozildi |
| 35 | EPC-1 | Quvvat qatorida faqat «1,1» — birligi ko'rsatilmagan, `кВт` deb olindi |
| 44 | Tank 19V | «Ёмкость **8 л**» — model nomiga ko'ra 19 л bo'lishi kerak |
| 48 | Tank 50 V | «Ёмкость **36 л**» — model nomiga ko'ra 50 л bo'lishi kerak |
| 52 | YL90-L-2 | «Мощность,Kw 3» ikki marta takrorlangan |
| 36–39 | RS seriyasi | «Пропускная способность, м3/**мин**» — м³/**ч** bo'lishi ehtimoli yuqori; JSON da `м³/ч` |
| ko'p joyda | — | «Частота **ГГц** 50» → aslida **Гц**; «Напряжение сети 220 **Вт**» → **В**. JSON da to'g'rilangan |
| 21, 51, 52 | QDX 150-11-5.5, YL90L-4, YL90-L-2 | «Бренд OCO» qatori yo'q; baribir OCO deb yozildi |

Bundan tashqari 40 va 41-o'rindagi **LPS 15-9 Z** bir xil nom bilan ikki marta
keladi (farqi — 41-si latun). JSON da ular `LPS-15-9Z` va `LPS-15-9Z-BR` sifatida
ajratilgan.
