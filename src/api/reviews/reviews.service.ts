import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ProductsService } from '../products/products.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsQueryDto } from './dto/reviews-query.dto';
import { round2 } from '../products/products.pricing';

const REVIEW_AUTHOR_SELECT = {
  select: { id: true, full_name: true, photo: true },
} satisfies Prisma.ProductReviewInclude['user'];

const SORT_STRATEGIES: Record<
  string,
  Prisma.ProductReviewOrderByWithRelationInput
> = {
  newest: { created_at: 'desc' },
  oldest: { created_at: 'asc' },
  rating_desc: { rating: 'desc' },
  rating_asc: { rating: 'asc' },
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  /**
   * Bitta foydalanuvchi bitta mahsulotga bitta baho qoldiradi - qayta yuborsa
   * eskisi yangilanadi (upsert). Har o'zgarishda mahsulot reytingi qayta hisoblanadi.
   */
  async upsertReview(productId: string, userId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, is_archived: true },
    });

    if (!product || product.is_archived) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const isVerifiedPurchase = await this.hasPurchased(productId, userId);

    const review = await this.prisma.productReview.upsert({
      where: { product_id_user_id: { product_id: productId, user_id: userId } },
      create: {
        product_id: productId,
        user_id: userId,
        rating: dto.rating,
        comment: dto.comment ?? null,
        is_verified_purchase: isVerifiedPurchase,
      },
      update: {
        rating: dto.rating,
        comment: dto.comment ?? null,
        is_verified_purchase: isVerifiedPurchase,
      },
      include: { user: REVIEW_AUTHOR_SELECT },
    });

    await this.recalculateProductRating(productId);

    return review;
  }

  async removeReview(reviewId: string, userId: string, role: Role) {
    const review = await this.prisma.productReview.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (role !== Role.ADMIN && review.user_id !== userId) {
      throw new ForbiddenException('Forbidden resource');
    }

    await this.prisma.productReview.delete({ where: { id: reviewId } });
    await this.recalculateProductRating(review.product_id);

    return { deleted: true };
  }

  async findByProduct(productId: string, query: ReviewsQueryDto) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 100);

    const where: Prisma.ProductReviewWhereInput = { product_id: productId };
    if (query.rating !== undefined) where.rating = query.rating;
    if (query.verified_only) where.is_verified_purchase = true;

    const [data, total, summary] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: SORT_STRATEGIES[query.sort ?? 'newest'],
        include: { user: REVIEW_AUTHOR_SELECT },
      }),
      this.prisma.productReview.count({ where }),
      this.getRatingSummary(productId),
    ]);

    const totalPages = Math.ceil(total / limit) || 0;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        summary,
      },
    };
  }

  /** Yulduzlar bo'yicha taqsimot - mahsulot sahifasidagi reyting diagrammasi uchun. */
  async getRatingSummary(productId: string) {
    const grouped = await this.prisma.productReview.groupBy({
      by: ['rating'],
      where: { product_id: productId },
      _count: { _all: true },
    });

    const distribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    let total = 0;
    let sum = 0;

    for (const row of grouped) {
      distribution[row.rating] = row._count._all;
      total += row._count._all;
      sum += row.rating * row._count._all;
    }

    return {
      average: total ? round2(sum / total) : 0,
      count: total,
      distribution,
    };
  }

  private async recalculateProductRating(productId: string) {
    const summary = await this.getRatingSummary(productId);

    await this.prisma.product.update({
      where: { id: productId },
      data: { rating: summary.average, rating_count: summary.count },
    });

    // Reyting `popularity_score` ga kiradi - TOP ro'yxati darhol yangilanadi
    await this.productsService.recalculatePopularity(productId);

    return summary;
  }

  /** Foydalanuvchi mahsulotni haqiqatdan sotib olganmi (bekor qilinmagan buyurtma). */
  private async hasPurchased(productId: string, userId: string) {
    const orderItem = await this.prisma.orderItem.findFirst({
      where: {
        product_id: productId,
        order: {
          user_id: userId,
          status: { not: OrderStatus.CANCELLED },
        },
      },
      select: { id: true },
    });

    return !!orderItem;
  }
}
