import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { round2 } from '../products/products.pricing';

@Injectable()
export class CartsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Savat summasini chegirma hisobga olingan `final_price` bo'yicha hisoblaydi.
   * Frontend narxni qayta hisoblamasligi va checkout bilan farq qilmasligi uchun.
   */
  private withTotals<
    T extends {
      items: Array<{
        quantity: number;
        product: { price: number; final_price: number } | null;
      }>;
    },
  >(cart: T) {
    let subtotal = 0;
    let originalTotal = 0;
    let itemsCount = 0;

    for (const item of cart.items) {
      const price = item.product?.price ?? 0;
      const unitPrice = item.product?.final_price || price;

      subtotal += unitPrice * item.quantity;
      originalTotal += price * item.quantity;
      itemsCount += item.quantity;
    }

    return {
      ...cart,
      totals: {
        items_count: itemsCount,
        subtotal: round2(subtotal),
        original_total: round2(originalTotal),
        discount_total: round2(originalTotal - subtotal),
      },
    };
  }

  async findOrCreateCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { user_id: userId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { user_id: userId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });
    }

    return cart;
  }

  async getCart(userId: string) {
    return this.withTotals(await this.findOrCreateCart(userId));
  }

  async addItem(userId: string, productId: string, quantity: number = 1) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.is_archived) {
      throw new BadRequestException(
        'Product is archived and cannot be added to cart',
      );
    }

    if (product.price_on_request) {
      throw new BadRequestException(
        'Price for this product is available on request. Please contact the seller',
      );
    }

    if (product.stock < quantity) {
      throw new BadRequestException('Not enough stock available');
    }

    const cart = await this.findOrCreateCart(userId);

    const existingItem = cart.items.find(
      (item) => item.product_id === productId,
    );

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (product.stock < newQuantity) {
        throw new BadRequestException('Not enough stock available');
      }

      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cart_id: cart.id,
          product_id: productId,
          quantity,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItemQuantity(
    userId: string,
    productId: string,
    quantity: number,
  ) {
    if (quantity <= 0) {
      return this.removeItem(userId, productId);
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.price_on_request) {
      throw new BadRequestException(
        'Price for this product is available on request. Please contact the seller',
      );
    }

    if (product.stock < quantity) {
      throw new BadRequestException('Not enough stock available');
    }

    const cart = await this.findOrCreateCart(userId);
    const existingItem = cart.items.find(
      (item) => item.product_id === productId,
    );

    if (!existingItem) {
      throw new NotFoundException('Item not found in cart');
    }

    await this.prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, productId: string) {
    const cart = await this.findOrCreateCart(userId);
    const existingItem = cart.items.find(
      (item) => item.product_id === productId,
    );

    if (!existingItem) {
      throw new NotFoundException('Item not found in cart');
    }

    await this.prisma.cartItem.delete({
      where: { id: existingItem.id },
    });

    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    const cart = await this.findOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({
      where: { cart_id: cart.id },
    });
    return this.getCart(userId);
  }
}
