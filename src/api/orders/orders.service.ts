import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrderStatus } from '@prisma/client';
import { POPULARITY_WEIGHTS, round2 } from '../products/products.pricing';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async checkout(userId: string) {
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
      });
    }

    // Bekor qilinganda zaxira qaytariladi va sotuv statistikasi tuzatiladi,
    // aks holda bekor qilingan buyurtmalar TOP mahsulotlar ro'yxatini buzadi.
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
      });
    });
  }

  async findAllAdmin() {
    return this.prisma.order.findMany({
      include: {
        user: true,
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
}
