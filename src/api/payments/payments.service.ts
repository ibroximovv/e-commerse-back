import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaymentStatus, OrderStatus, Prisma } from '@prisma/client';
import { PaymentsQueryDto } from './dto/payments-query.dto';
import { PaymeService } from './payme/payme.service';
import { Lang } from '../../common/i18n/locale';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymeService: PaymeService,
  ) {}

  /**
   * Buyurtma uchun Payme kassasiga havola qaytaradi.
   *
   * To'lovni bu yerda YAKUNLAMAYDI: mijoz havolaga o'tib karta ma'lumotlarini
   * kiritgach, Payme serveri `POST /api/payments/payme` ga murojaat qiladi va
   * buyurtma o'sha yerda `CONFIRMED` bo'ladi. Ilgari bu metod to'lovni
   * darhol `SUCCESSFUL` qilib qo'yardi - ya'ni hech qanday pul o'tmasdan
   * buyurtma to'langan hisoblanardi.
   */
  async createCheckout(userId: string, orderId: string, lang: Lang = 'uz') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });

    if (!order || order.user_id !== userId) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Order cannot be paid because status is "${order.status}"`,
      );
    }

    if (order.payment?.status === PaymentStatus.SUCCESSFUL) {
      throw new BadRequestException('Order has already been paid');
    }

    // Tekis obyekt qaytaramiz: `ResponseInterceptor` `{message, data}` shaklini
    // sahifalangan javobdan ajrata olmaydi va uni ikki qavat o'rab yuborardi.
    return {
      order_id: order.id,
      provider: 'payme',
      amount: order.total_amount,
      checkout_url: this.paymeService.buildCheckoutUrl(
        order.id,
        order.total_amount,
        lang,
      ),
    };
  }

  async getPaymentStatus(
    orderId: string,
    userId: string,
    isAdmin: boolean = false,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!isAdmin && order.user_id !== userId) {
      throw new NotFoundException('Order not found');
    }

    if (!order.payment) {
      throw new NotFoundException(
        'No payment transaction found for this order',
      );
    }

    return order.payment;
  }

  async findAllAdmin(query: PaymentsQueryDto) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.provider) {
      where.provider = { contains: query.provider.trim(), mode: 'insensitive' };
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { payme_transaction_id: { contains: term, mode: 'insensitive' } },
        { order_id: { contains: term, mode: 'insensitive' } },
        { provider: { contains: term, mode: 'insensitive' } },
      ];
    }

    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: sortOrder },
        include: {
          order: {
            include: {
              user: {
                select: { id: true, email: true, full_name: true },
              },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
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
