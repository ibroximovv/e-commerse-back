import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create Default Admin User
  const adminEmail = 'admin@gmail.com';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  let adminUser;
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('password', 10);
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        full_name: 'System Admin',
        role: Role.ADMIN,
        is_verified: true,
      },
    });
    console.log('Admin user created successfully (email: admin@gmail.com, password: password)');
  } else {
    adminUser = existingAdmin;
    console.log('Admin user already exists.');
  }

  // 2. Create Default Categories
  const electronicsCategory = await prisma.category.upsert({
    where: { name: 'Electronics' },
    update: {},
    create: {
      name: 'Electronics',
      description: 'Smartphones and gadgets',
      is_archived: false,
    },
  });

  const accessoriesCategory = await prisma.category.upsert({
    where: { name: 'Accessories' },
    update: {},
    create: {
      name: 'Accessories',
      description: 'Cables, cases, chargers',
      is_archived: false,
    },
  });

  console.log('Categories seeded.');

  // 3. Create Default Products
  await prisma.product.deleteMany({
    where: {
      name: {
        in: ['iPhone 15 Pro', 'MacBook Pro'],
      },
    },
  });

  await prisma.product.create({
    data: {
      name: 'iPhone 15 Pro',
      description: 'Super fast phone',
      price: 999.99,
      stock: 20,
      images: ['uploads/iphone15.png'],
      is_archived: false,
      category_id: electronicsCategory.id,
      attributes: [
        { key: 'Color', value: 'Black' },
        { key: 'Storage', value: '256GB' },
      ],
    },
  });

  await prisma.product.create({
    data: {
      name: 'MacBook Pro',
      description: 'High performance laptops',
      price: 1999.99,
      stock: 10,
      images: ['uploads/macbookpro.png'],
      is_archived: false,
      category_id: electronicsCategory.id,
      attributes: [
        { key: 'RAM', value: '16GB' },
        { key: 'Storage', value: '512GB SSD' },
      ],
    },
  });

  console.log('Products seeded.');
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
