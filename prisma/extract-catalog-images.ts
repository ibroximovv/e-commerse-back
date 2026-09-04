/**
 * Katalog PDF'idan mahsulot rasmlarini ajratib oladi.
 *
 * PDF'ning o'zi repoda saqlanmaydi (2 MB, doim yangilanadi), shuning uchun
 * skript uni yo'l orqali oladi. Natija - `prisma/catalog/images/<slug>.jpg`
 * fayllari va `products.json` dagi to'ldirilgan `images` massivlari.
 * O'sha rasmlarni keyin `import-catalog.ts` `uploads/catalog/` ga ko'chiradi.
 *
 * NIMA UCHUN QO'LDA JADVAL BOR
 * ----------------------------
 * PDF ichida rasm obyektlarining tartibi sahifadagi ko'rinish tartibiga mos
 * kelmaydi (5-sahifada rasmlar teskari, 13- va 16-sahifalarda aralash), ba'zi
 * suratlar esa ikkita qatorga umumiy. Shuning uchun bog'lanish
 * `catalog/images.map.json` da QO'LDA tekshirilgan holda saqlanadi.
 *
 * TALAB QILINADI (faqat ishlab chiqish mashinasida):
 *   sudo apt install poppler-utils imagemagick
 * Serverda kerak emas - tayyor rasmlar git orqali keladi.
 *
 * Ishlatish:
 *   npm run catalog:images -- "/path/Каталог 2026-III.pdf"
 *   npm run catalog:images -- "/path/catalog.pdf" --dry-run
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CATALOG_DIR = path.join(__dirname, 'catalog');
const IMAGES_DIR = path.join(CATALOG_DIR, 'images');
const PRODUCTS_FILE = path.join(CATALOG_DIR, 'products.json');
const MAP_FILE = path.join(CATALOG_DIR, 'images.map.json');

/** Mahsulot rasmi uchun maksimal o'lcham (px). Manba rasmlar undan kichik. */
const MAX_SIZE = 900;
const JPEG_QUALITY = 88;

interface ImageMapEntry {
  page: number;
  num: number;
  sku: string | string[];
}

interface CatalogProduct {
  sku?: string | null;
  slug?: string;
  images?: string[];
  [key: string]: unknown;
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const pdfPath = args.find((a) => !a.startsWith('--'));

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function requireTool(name: string, hint: string) {
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
  } catch {
    fail(`\`${name}\` topilmadi. O'rnating: ${hint}`);
  }
}

/**
 * PDF ichidagi rasm obyektlari ro'yxati.
 *
 * `smask` qatorlari alohida keladi: bu shaffoflik niqobi. Uni asosiy rasmga
 * qo'shmasak, fon QORA bo'lib qoladi (katalogdagi bir necha surat aynan
 * shunday saqlangan).
 */
function listImages(pdf: string): Map<string, { hasMask: boolean }> {
  const raw = execFileSync('pdfimages', ['-list', pdf], {
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 32,
  });

  const rows = raw
    .split('\n')
    .slice(2)
    .map((line) => line.trim().split(/\s+/))
    .filter((f) => f.length > 8);

  const result = new Map<string, { hasMask: boolean }>();

  rows.forEach((fields, index) => {
    if (fields[2] !== 'image') return;
    const next = rows[index + 1];
    result.set(`${Number(fields[0])}:${Number(fields[1])}`, {
      // Niqob har doim o'z rasmidan keyin, keyingi raqam bilan keladi
      hasMask: !!next && next[2] === 'smask',
    });
  });

  return result;
}

function main() {
  if (!pdfPath) {
    fail(
      "PDF yo'li ko'rsatilmadi.\n" +
        '  npm run catalog:images -- "/path/Каталог 2026-III.pdf"',
    );
  }
  if (!fs.existsSync(pdfPath)) fail(`Fayl topilmadi: ${pdfPath}`);

  requireTool('pdfimages', 'sudo apt install poppler-utils');
  requireTool('convert', 'sudo apt install imagemagick');

  const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8')) as {
    images: ImageMapEntry[];
  };
  const productsFile = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8')) as {
    products: CatalogProduct[];
  };

  const bySku = new Map<string, CatalogProduct>();
  for (const product of productsFile.products) {
    if (product.sku) bySku.set(product.sku.toUpperCase(), product);
  }

  // Jadvaldagi har bir SKU haqiqatan mavjudligini OLDIN tekshiramiz: yarim
  // ko'chirilgan holatdan ko'ra umuman boshlamagan yaxshi.
  const unknown = map.images
    .flatMap((entry) => (Array.isArray(entry.sku) ? entry.sku : [entry.sku]))
    .filter((sku) => !bySku.has(sku.toUpperCase()));
  if (unknown.length) {
    fail(
      `products.json da bunday SKU yo'q: ${[...new Set(unknown)].join(', ')}`,
    );
  }

  const inventory = listImages(pdfPath);
  const missing = map.images.filter(
    (e) => !inventory.has(`${e.page}:${e.num}`),
  );
  if (missing.length) {
    fail(
      "PDF'da jadvaldagi rasmlar topilmadi: " +
        missing.map((e) => `p${e.page}#${e.num}`).join(', ') +
        "\nBoshqa nashrdagi PDF berilgan bo'lsa images.map.json ni yangilang.",
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oco-catalog-'));

  try {
    console.log(`PDF        : ${pdfPath}`);
    console.log(`Rasmlar    : ${map.images.length} ta`);
    console.log(`Chiqish    : ${path.relative(process.cwd(), IMAGES_DIR)}`);
    if (DRY_RUN) console.log('DRY-RUN    : hech narsa yozilmaydi');
    console.log('');

    // Butun PDF bir marta ochiladi. Sahifalarni ajratib chaqirib bo'lmaydi:
    // `pdfimages` obyekt raqamlarini HAR CHAQIRUVDA noldan sanaydi, ya'ni
    // `-f 5 -l 5` da 38-rasm 000 bo'lib chiqadi va jadval mos kelmay qoladi.
    execFileSync('pdfimages', [
      '-png',
      '-p',
      pdfPath,
      path.join(tmpDir, 'img'),
    ]);

    if (!DRY_RUN) {
      fs.rmSync(IMAGES_DIR, { recursive: true, force: true });
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }

    // Bitta mahsulotda bir nechta rasm bo'lsa nomlarga tartib raqami qo'shiladi
    const perProduct = new Map<string, string[]>();
    for (const entry of map.images) {
      const skus = Array.isArray(entry.sku) ? entry.sku : [entry.sku];
      const source = path.join(
        tmpDir,
        `img-${String(entry.page).padStart(3, '0')}-${String(entry.num).padStart(3, '0')}.png`,
      );
      if (!fs.existsSync(source)) {
        fail(`Ajratilgan fayl topilmadi: ${source}`);
      }

      const primary = bySku.get(skus[0].toUpperCase())!;
      const slug = primary.slug ?? skus[0].toLowerCase();
      const taken = perProduct.get(slug)?.length ?? 0;
      const name = taken === 0 ? `${slug}.jpg` : `${slug}-${taken + 1}.jpg`;
      const target = path.join(IMAGES_DIR, name);

      if (!DRY_RUN) {
        const mask = path.join(
          tmpDir,
          `img-${String(entry.page).padStart(3, '0')}-${String(entry.num + 1).padStart(3, '0')}.png`,
        );
        const hasMask =
          inventory.get(`${entry.page}:${entry.num}`)?.hasMask &&
          fs.existsSync(mask);

        execFileSync('convert', [
          source,
          // Shaffoflik niqobi bo'lsa - uni alfa kanal qilib qo'shamiz, aks
          // holda mahsulot qop-qora fonda chiqadi
          ...(hasMask
            ? [mask, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite']
            : []),
          '-background',
          'white',
          '-alpha',
          'remove',
          '-alpha',
          'off',
          // Bir xil rangli hoshiyani kesamiz: katalogda suratlar atrofida
          // turli kenglikdagi bo'sh joy bor, do'konda esa ular bir xil
          // o'lchamdagi kartochkalarda ko'rinadi
          '-fuzz',
          '2%',
          '-trim',
          '+repage',
          '-resize',
          `${MAX_SIZE}x${MAX_SIZE}>`,
          '-quality',
          String(JPEG_QUALITY),
          target,
        ]);
      }

      // Bitta surat ikki mahsulotga tegishli bo'lsa - fayl bitta, havola ikkita
      for (const sku of skus) {
        const product = bySku.get(sku.toUpperCase())!;
        const productSlug = product.slug ?? sku.toLowerCase();
        const list = perProduct.get(productSlug) ?? [];
        list.push(`uploads/catalog/${name}`);
        perProduct.set(productSlug, list);
      }
    }

    for (const product of productsFile.products) {
      const slug = product.slug ?? '';
      product.images = perProduct.get(slug) ?? [];
    }

    const withoutImages = productsFile.products.filter(
      (p) => !p.images?.length,
    );

    if (!DRY_RUN) {
      fs.writeFileSync(
        PRODUCTS_FILE,
        JSON.stringify(productsFile, null, 2) + '\n',
        'utf-8',
      );
    }

    console.log(`Yozildi    : ${perProduct.size} ta mahsulotga rasm`);
    console.log(`Fayllar    : ${map.images.length} ta .jpg`);
    if (withoutImages.length) {
      console.log(
        `⚠️ Rasmsiz : ${withoutImages.length} ta - ` +
          withoutImages.map((p) => p.sku ?? p.slug).join(', '),
      );
    }
    console.log('');
    console.log(
      DRY_RUN
        ? "DRY-RUN edi. Haqiqiy ko'chirish uchun --dry-run ni olib tashlang."
        : 'Keyingi qadam: npm run db:import:catalog',
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
