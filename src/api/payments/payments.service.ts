import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaymentStatus, OrderStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async payOrder(userId: string, orderId: string, provider: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Find the order
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { payment: true },
      });

      if (!order || order.user_id !== userId) {
        throw new NotFoundException('Order not found');
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(`Order cannot be paid because status is "${order.status}"`);
      }

      if (order.payment && order.payment.status === PaymentStatus.SUCCESSFUL) {
        throw new BadRequestException('Order has already been paid');
      }

      const transactionId = `txn_${crypto.randomBytes(8).toString('hex')}`;

      // 2. Create or Update Payment transaction
      let payment;
      if (order.payment) {
        payment = await tx.payment.update({
          where: { id: order.payment.id },
          data: {
            provider,
            status: PaymentStatus.SUCCESSFUL,
            transaction_id: transactionId,
            amount: order.total_amount,
          },
        });
      } else {
        payment = await tx.payment.create({
          data: {
            order_id: orderId,
            amount: order.total_amount,
            provider,
            status: PaymentStatus.SUCCESSFUL,
            transaction_id: transactionId,
          },
        });
      }

      // 3. Update the Order status to CONFIRMED on successful payment
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CONFIRMED },
      });

      return {
        message: 'Payment processed successfully',
        payment,
      };
    });
  }

  async getPaymentStatus(orderId: string, userId: string, isAdmin: boolean = false) {
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
      throw new NotFoundException('No payment transaction found for this order');
    }

    return order.payment;
  }
}
