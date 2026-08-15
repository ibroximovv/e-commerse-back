import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Yordamchilar (src/common/utils/slug.util.ts bilan bir xil mantiq)
// ---------------------------------------------------------------------------

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya', ғ: 'g', қ: 'q', ҳ: 'h', ў: 'o',
  'ʻ': '', 'ʼ': '', '‘': '', '’': '', "'": '', '`': '',
};

function slugify(value: string): string {
  let out = '';
  for (const char of value.toLowerCase().trim()) {
    out += TRANSLIT[char] !== undefined ? TRANSLIT[char] : char;
  }
  return out
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function priceFields(price: number, discountPrice?: number) {
  const hasDiscount =
    discountPrice !== undefined && discountPrice >= 0 && discountPrice < price;
  const finalPrice = hasDiscount ? (discountPrice as number) : price;
  return {
    price,
    discount_price: hasDiscount ? (discountPrice as number) : null,
    final_price: Math.round(finalPrice * 100) / 100,
    discount_percent: hasDiscount
      ? Math.round(((price - finalPrice) / price) * 100)
      : 0,
  };
}

function popularity(sales: number, rating: number, ratingCount: number, views: number) {
  return Math.round((sales * 100 + rating * ratingCount * 20 + views) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Kategoriya daraxti
// ---------------------------------------------------------------------------

interface CategorySeed {
  name: string;
  description?: string;
  is_featured?: boolean;
  sort_order?: number;
  children?: CategorySeed[];
}

const CATEGORY_TREE: CategorySeed[] = [
  {
    name: 'Electronics',
    description: 'Smartphones and gadgets',
    is_featured: true,
    sort_order: 1,
    children: [
      { name: 'Smartphones', description: 'Android va iOS telefonlar', sort_order: 1 },
      { name: 'Laptops', description: 'High performance laptops', sort_order: 2 },
      { name: 'Tablets', description: 'Planshetlar', sort_order: 3 },
      { name: 'Headphones', description: 'Quloqchinlar va audio', sort_order: 4 },
    ],
  },
  {
    name: 'Accessories',
    description: 'Cables, cases, chargers',
    is_featured: true,
    sort_order: 2,
    children: [
      { name: 'Chargers', description: 'Quvvatlagichlar', sort_order: 1 },
      { name: 'Cases', description: 'Chexol va himoya', sort_order: 2 },
    ],
  },
  {
    name: 'Home Appliances',
    description: 'Maishiy texnika',
    sort_order: 3,
    children: [
      { name: 'Kitchen', description: 'Oshxona texnikasi', sort_order: 1 },
    ],
  },
];

async function seedCategories(
  nodes: CategorySeed[],
  parentId: string | null = null,
  registry = new Map<string, string>(),
) {
  for (const node of nodes) {
    const data = {
      slug: slugify(node.name),
      description: node.description ?? null,
      is_featured: node.is_featured ?? false,
      sort_order: node.sort_order ?? 0,
      parent_id: parentId,
      is_archived: false,
    };

    const category = await prisma.category.upsert({
      where: { name: node.name },
      update: data,
      create: { name: node.name, ...data },
    });

    registry.set(node.name, category.id);

    if (node.children?.length) {
      await seedCategories(node.children, category.id, registry);
    }
  }

  return registry;
}

// ---------------------------------------------------------------------------
// Mahsulotlar
// ---------------------------------------------------------------------------

interface ProductSeed {
  name: string;
  category: string;
  brand: string;
  sku: string;
  description: string;
  price: number;
  discount_price?: number;
  stock: number;
  images: string[];
  tags: string[];
  attributes: Array<{ key: string; value: string }>;
  is_top?: boolean;
  is_featured?: boolean;
  sales_count?: number;
  view_count?: number;
  rating?: number;
  rating_count?: number;
}

const PRODUCTS: ProductSeed[] = [
  {
    name: 'iPhone 15 Pro',
    category: 'Smartphones',
    brand: 'Apple',
    sku: 'APL-IP15P-256',
    description: 'Super fast phone',
    price: 999.99,
    discount_price: 899.99,
    stock: 20,
    images: ['uploads/iphone15.png'],
    tags: ['smartphone', 'apple', '5g', 'flagman'],
    attributes: [
      { key: 'Color', value: 'Black' },
      { key: 'Storage', value: '256GB' },
      { key: 'RAM', value: '8GB' },
    ],
    is_top: true,
    is_featured: true,
    sales_count: 143,
    view_count: 5210,
    rating: 4.8,
    rating_count: 96,
  },
  {
    name: 'Samsung Galaxy S24 Ultra',
    category: 'Smartphones',
    brand: 'Samsung',
    sku: 'SAM-S24U-512',
    description: 'Flagman Android smartfon',
    price: 1199.0,
    stock: 14,
    images: ['uploads/galaxy-s24-ultra.png'],
    tags: ['smartphone', 'samsung', '5g', 'flagman'],
    attributes: [
      { key: 'Color', value: 'Titanium' },
      { key: 'Storage', value: '512GB' },
      { key: 'RAM', value: '12GB' },
    ],
    is_top: true,
    sales_count: 98,
    view_count: 3980,
    rating: 4.6,
    rating_count: 71,
  },
  {
    name: 'Xiaomi Redmi Note 13',
    category: 'Smartphones',
    brand: 'Xiaomi',
    sku: 'XMI-RN13-128',
    description: 'Arzon va quvvatli byudjet telefon',
    price: 249.0,
    discount_price: 199.0,
    stock: 60,
    images: ['uploads/redmi-note-13.png'],
    tags: ['smartphone', 'xiaomi', 'byudjet'],
    attributes: [
      { key: 'Color', value: 'Blue' },
      { key: 'Storage', value: '128GB' },
      { key: 'RAM', value: '8GB' },
    ],
    sales_count: 320,
    view_count: 7400,
    rating: 4.3,
    rating_count: 210,
  },
  {
    name: 'MacBook Pro',
    category: 'Laptops',
    brand: 'Apple',
    sku: 'APL-MBP14-512',
    description: 'High performance laptops',
    price: 1999.99,
    stock: 10,
    images: ['uploads/macbookpro.png'],
    tags: ['laptop', 'apple', 'pro'],
    attributes: [
      { key: 'RAM', value: '16GB' },
      { key: 'Storage', value: '512GB SSD' },
      { key: 'Color', value: 'Space Gray' },
    ],
    is_top: true,
    is_featured: true,
    sales_count: 64,
    view_count: 2890,
    rating: 4.9,
    rating_count: 48,
  },
  {
    name: 'Lenovo IdeaPad Gaming 3',
    category: 'Laptops',
    brand: 'Lenovo',
    sku: 'LEN-IPG3-512',
    description: "O'yin uchun byudjet noutbuk",
    price: 899.0,
    discount_price: 749.0,
    stock: 8,
    images: ['uploads/ideapad-gaming.png'],
    tags: ['laptop', 'gaming', 'lenovo'],
    attributes: [
      { key: 'RAM', value: '16GB' },
      { key: 'Storage', value: '512GB SSD' },
      { key: 'Color', value: 'Black' },
    ],
    sales_count: 41,
    view_count: 1620,
    rating: 4.2,
    rating_count: 33,
  },
  {
    name: 'iPad Air 11',
    category: 'Tablets',
    brand: 'Apple',
    sku: 'APL-IPADAIR-256',
    description: 'Yengil va tez planshet',
    price: 749.0,
    stock: 0,
    images: ['uploads/ipad-air.png'],
    tags: ['tablet', 'apple'],
    attributes: [
      { key: 'Color', value: 'Blue' },
      { key: 'Storage', value: '256GB' },
    ],
    sales_count: 27,
    view_count: 1140,
    rating: 4.5,
    rating_count: 19,
  },
  {
    name: 'AirPods Pro 2',
    category: 'Headphones',
    brand: 'Apple',
    sku: 'APL-APP2',
    description: 'Faol shovqin bostirishli quloqchin',
    price: 249.0,
    discount_price: 219.0,
    stock: 3,
    images: ['uploads/airpods-pro-2.png'],
    tags: ['headphones', 'apple', 'wireless'],
    attributes: [
      { key: 'Color', value: 'White' },
      { key: 'Type', value: 'In-ear' },
    ],
    is_featured: true,
    sales_count: 210,
    view_count: 6300,
    rating: 4.7,
    rating_count: 154,
  },
  {
    name: 'Anker 65W GaN Charger',
    category: 'Chargers',
    brand: 'Anker',
    sku: 'ANK-GAN65',
    description: 'Tez quvvatlagich, 3 portli',
    price: 59.0,
    discount_price: 44.0,
    stock: 120,
    images: ['uploads/anker-65w.png'],
    tags: ['charger', 'anker', 'usb-c'],
    attributes: [
      { key: 'Power', value: '65W' },
      { key: 'Color', value: 'White' },
    ],
    sales_count: 512,
    view_count: 9100,
    rating: 4.4,
    rating_count: 288,
  },
  {
    name: 'Spigen Ultra Hybrid Case',
    category: 'Cases',
    brand: 'Spigen',
    sku: 'SPG-UH-IP15',
    description: 'Shaffof himoya chexol',
    price: 24.0,
    stock: 200,
    images: ['uploads/spigen-case.png'],
    tags: ['case', 'spigen'],
    attributes: [
      { key: 'Color', value: 'Clear' },
      { key: 'Material', value: 'TPU' },
    ],
    sales_count: 430,
    view_count: 5200,
    rating: 4.1,
    rating_count: 176,
  },
  {
    name: 'Philips Airfryer XL',
    category: 'Kitchen',
    brand: 'Philips',
    sku: 'PHL-AF-XL',
    description: 'Moysiz fritur, 6.2L',
    price: 219.0,
    discount_price: 179.0,
    stock: 25,
    images: ['uploads/philips-airfryer.png'],
    tags: ['kitchen', 'philips'],
    attributes: [
      { key: 'Capacity', value: '6.2L' },
      { key: 'Color', value: 'Black' },
    ],
    sales_count: 76,
    view_count: 2100,
    rating: 4.6,
    rating_count: 57,
  },
];

async function seedProducts(categoryIds: Map<string, string>) {
  for (const item of PRODUCTS) {
    const categoryId = categoryIds.get(item.category);
    if (!categoryId) {
      throw new Error(`Seed category not found: ${item.category}`);
    }

    const sales = item.sales_count ?? 0;
    const rating = item.rating ?? 0;
    const ratingCount = item.rating_count ?? 0;
    const views = item.view_count ?? 0;

    const data = {
      name: item.name,
      description: item.description,
      brand: item.brand,
      sku: item.sku,
      tags: item.tags,
      stock: item.stock,
      images: item.images,
      attributes: item.attributes,
      is_archived: false,
      is_top: item.is_top ?? false,
      is_featured: item.is_featured ?? false,
      sales_count: sales,
      view_count: views,
      rating,
      rating_count: ratingCount,
      popularity_score: popularity(sales, rating, ratingCount, views),
      category_id: categoryId,
      ...priceFields(item.price, item.discount_price),
    };

    await prisma.product.upsert({
      where: { slug: slugify(item.name) },
      update: data,
      create: { slug: slugify(item.name), ...data },
    });
  }
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding database...');

  const adminEmail = 'admin@gmail.com';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: await bcrypt.hash('password', 10),
        full_name: 'System Admin',
        role: Role.ADMIN,
        is_verified: true,
      },
    });
    console.log(
      'Admin user created successfully (email: admin@gmail.com, password: password)',
    );
  } else {
    console.log('Admin user already exists.');
  }

  const categoryIds = await seedCategories(CATEGORY_TREE);
  console.log(`Categories seeded (${categoryIds.size} ta, ierarxiya bilan).`);

  await seedProducts(categoryIds);
  console.log(`Products seeded (${PRODUCTS.length} ta).`);

  console.log('Database seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
