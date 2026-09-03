import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { round2 } from '../products/products.pricing';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      allOrders,
      successfulPayments,
      totalUsers,
      verifiedUsers,
      totalProducts,
      archivedProducts,
      outOfStockProducts,
      lowStockProducts,
      priceOnRequestProducts,
      recentOrders,
      topProducts,
    ] = await Promise.all([
      this.prisma.order.findMany({
        select: {
          id: true,
          total_amount: true,
          status: true,
          created_at: true,
        },
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCESSFUL },
        _sum: { amount: true },
      }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { is_verified: true } }),
      this.prisma.product.count({ where: { is_archived: false } }),
      this.prisma.product.count({ where: { is_archived: true } }),
      // Narxi kelishiladigan tovarlarning zaxirasi ataylab 0 - ular "tugagan"
      // emas, shuning uchun alohida sanaladi
      this.prisma.product.count({
        where: { is_archived: false, stock: 0, price_on_request: false },
      }),
      this.prisma.product.count({
        where: { is_archived: false, stock: { gt: 0, lte: 5 } },
      }),
      this.prisma.product.count({
        where: { is_archived: false, price_on_request: true },
      }),
      this.prisma.order.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, full_name: true, phone: true },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name_uz: true,
                  name_ru: true,
                  name_en: true,
                  images: true,
                  slug: true,
                },
              },
            },
          },
          payment: true,
        },
      }),
      this.prisma.product.findMany({
        where: { is_archived: false },
        take: 5,
        orderBy: [{ sales_count: 'desc' }, { popularity_score: 'desc' }],
        select: {
          id: true,
          name_uz: true,
          name_ru: true,
          name_en: true,
          slug: true,
          price: true,
          final_price: true,
          stock: true,
          images: true,
          sales_count: true,
          rating: true,
          price_on_request: true,
        },
      }),
    ]);

    // Order status breakdown
    const orderCounts = {
      total: allOrders.length,
      pending: 0,
      confirmed: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };

    let totalRevenue = 0;
    const monthlyMap = new Map<string, { revenue: number; orders: number }>();

    // Pre-populate last 6 months in format YYYY-MM
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, { revenue: 0, orders: 0 });
    }

    for (const order of allOrders) {
      if (order.status === OrderStatus.PENDING) orderCounts.pending++;
      else if (order.status === OrderStatus.CONFIRMED) orderCounts.confirmed++;
      else if (order.status === OrderStatus.SHIPPED) orderCounts.shipped++;
      else if (order.status === OrderStatus.DELIVERED) orderCounts.delivered++;
      else if (order.status === OrderStatus.CANCELLED) orderCounts.cancelled++;

      if (order.status !== OrderStatus.CANCELLED) {
        totalRevenue += order.total_amount;

        const orderDate = new Date(order.created_at);
        const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
        const currentMonth = monthlyMap.get(monthKey);
        if (currentMonth) {
          currentMonth.revenue += order.total_amount;
          currentMonth.orders += 1;
        }
      }
    }

    const monthly_sales = Array.from(monthlyMap.entries()).map(
      ([month, data]) => ({
        month,
        revenue: round2(data.revenue),
        orders: data.orders,
      }),
    );

    return {
      revenue: {
        total_revenue: round2(totalRevenue),
        paid_revenue: round2(successfulPayments._sum.amount ?? 0),
      },
      orders: orderCounts,
      products: {
        total_active: totalProducts,
        archived: archivedProducts,
        out_of_stock: outOfStockProducts,
        low_stock: lowStockProducts,
        price_on_request: priceOnRequestProducts,
      },
      users: {
        total_users: totalUsers,
        verified_users: verifiedUsers,
      },
      monthly_sales,
      recent_orders: recentOrders,
      top_products: topProducts,
    };
  }
}
