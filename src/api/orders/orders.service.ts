import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrderStatus, Prisma } from '@prisma/client';
import { POPULARITY_WEIGHTS, round2 } from '../products/products.pricing';
import { CheckoutDto } from './dto/checkout.dto';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';

/**
 * `?end_date=2026-12-31` kabi vaqtsiz sana `00:00:00` ga aylanadi va o'sha kunning
 * buyurtmalari filtrdan tushib qolardi - shuning uchun kun oxiriga suramiz.
 * Vaqt ko'rsatilgan bo'lsa (`...T10:00:00Z`) qiymat o'zgarmaydi.
 */
function endOfDay(value: string): Date {
  const parsed = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed;
}

const ALLOWED_ORDER_SORT_FIELDS = [
  'created_at',
  'updated_at',
  'total_amount',
  'status',
] as const;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async checkout(userId: string, dto?: CheckoutDto) {
    // Execute all database calls inside an atomic Prisma Transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Get user's cart
      const cart = await tx.cart.findUnique({
        where: { user_id: userId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      let totalAmount = 0;
      const orderItemsData: any[] = [];

      // 2. Validate stock and prepare order items
      for (const item of cart.items) {
        const product = item.product;
        if (product.is_archived) {
          throw new BadRequestException(
            `Product "${product.name}" is archived and cannot be ordered`,
          );
        }

        if (product.price_on_request) {
          throw new BadRequestException(
            `Price for "${product.name}" is available on request and it cannot be ordered online`,
          );
        }

        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for product "${product.name}"`,
          );
        }

        // Zaxirani kamaytiramiz va shu yerning o'zida sotuv statistikasini yangilaymiz.
        // popularity_score TOP mahsulotlar ro'yxatini shakllantiradi.
        await tx.product.update({
          where: { id: product.id },
          data: {
            stock: {
              decrement: item.quantity,
            },
            sales_count: {
              increment: item.quantity,
            },
            popularity_score: {
              increment: item.quantity * POPULARITY_WEIGHTS.sale,
            },
          },
        });

        // Chegirma hisobga olingan yakuniy narx bilan sotamiz
        const unitPrice = product.final_price || product.price;

        totalAmount += unitPrice * item.quantity;
        orderItemsData.push({
          product_id: product.id,
          quantity: item.quantity,
          price_at_purchase: unitPrice,
        });
      }

      // 3. Create the Order and OrderItems
      const order = await tx.order.create({
        data: {
          user_id: userId,
          total_amount: round2(totalAmount),
          status: OrderStatus.PENDING,
          shipping_address: dto?.shipping_address ?? null,
          customer_phone: dto?.customer_phone ?? null,
          customer_name: dto?.customer_name ?? null,
          notes: dto?.notes ?? null,
          payment_method: dto?.payment_method ?? null,
          items: {
            createMany: {
              data: orderItemsData,
            },
          },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      // 4. Clear the cart items
      await tx.cartItem.deleteMany({
        where: { cart_id: cart.id },
      });

      return order;
    });
  }

  async findUserOrders(userId: string, isArchived: boolean = false) {
    return this.prisma.order.findMany({
      where: {
        user_id: userId,
        is_archived: isArchived,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        payment: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async findOne(orderId: string, userId: string, isAdmin: boolean = false) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: {
          include: {
            product: true,
          },
        },
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!isAdmin && order.user_id !== userId) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async archiveOrder(orderId: string, userId: string) {
    const order = await this.findOne(orderId, userId);
    return this.prisma.order.update({
      where: { id: order.id },
      data: { is_archived: true },
    });
  }

  async cancelOrder(orderId: string, userId: string, isAdmin: boolean = false) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!isAdmin && order.user_id !== userId) {
      throw new ForbiddenException('You cannot cancel another user order');
    }

    if (order.status === OrderStatus.CANCELLED) {
      return order;
    }

    if (!isAdmin && order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Only PENDING orders can be cancelled by customers. Current status: ${order.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.product_id },
          data: {
            stock: { increment: item.quantity },
            sales_count: { decrement: item.quantity },
            popularity_score: {
              decrement: item.quantity * POPULARITY_WEIGHTS.sale,
            },
          },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
        include: {
          items: {
            include: { product: true },
          },
          payment: true,
        },
      });
    });
  }

  async updateStatus(orderId: string, status: OrderStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === status) {
      return order;
    }

    const isBeingCancelled =
      status === OrderStatus.CANCELLED &&
      order.status !== OrderStatus.CANCELLED;

    if (!isBeingCancelled) {
      return this.prisma.order.update({
        where: { id: orderId },
        data: { status },
        include: {
          items: {
            include: { product: true },
          },
          payment: true,
        },
      });
    }

    // Bekor qilinganda zaxira qaytariladi va sotuv statistikasi tuzatiladi
    return this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.product_id },
          data: {
            stock: { increment: item.quantity },
            sales_count: { decrement: item.quantity },
            popularity_score: {
              decrement: item.quantity * POPULARITY_WEIGHTS.sale,
            },
          },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status },
        include: {
          items: {
            include: { product: true },
          },
          payment: true,
        },
      });
    });
  }

  async findAllAdmin(query: AdminOrdersQueryDto) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.start_date || query.end_date) {
      where.created_at = {};
      if (query.start_date) {
        where.created_at.gte = new Date(query.start_date);
      }
      if (query.end_date) {
        where.created_at.lte = endOfDay(query.end_date);
      }
    }

    if (query.min_amount !== undefined || query.max_amount !== undefined) {
      where.total_amount = {};
      if (query.min_amount !== undefined) {
        where.total_amount.gte = query.min_amount;
      }
      if (query.max_amount !== undefined) {
        where.total_amount.lte = query.max_amount;
      }
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { id: { contains: term, mode: 'insensitive' } },
        { customer_name: { contains: term, mode: 'insensitive' } },
        { customer_phone: { contains: term, mode: 'insensitive' } },
        { shipping_address: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
        { user: { full_name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const sortBy = (ALLOWED_ORDER_SORT_FIELDS as readonly string[]).includes(
      query.sortBy ?? '',
    )
      ? (query.sortBy as string)
      : 'created_at';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: true,
          items: {
            include: {
              product: true,
            },
          },
          payment: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }
}
