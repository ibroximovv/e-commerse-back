import { Injectable } from '@nestjs/common';
import { BaseService } from '../../common/services/base.service';
import { PrismaService } from '../../database/prisma.service';
import { Product, Prisma } from '@prisma/client';

@Injectable()
export class ProductsService extends BaseService<Product, any, any> {
  constructor(prisma: PrismaService) {
    super(prisma, 'Product');
  }

  override async create(data: any): Promise<Product> {
    const { category_id, ...rest } = data;
    return this.prisma.product.create({
      data: {
        ...rest,
        category: {
          connect: { id: category_id },
        },
      },
    });
  }

  override async update(id: string, data: any): Promise<Product> {
    const { category_id, ...rest } = data;
    const updateData: Prisma.ProductUpdateInput = { ...rest };
    if (category_id) {
      updateData.category = {
        connect: { id: category_id },
      };
    }
    return this.prisma.product.update({
      where: { id },
      data: updateData,
    });
  }

  async searchAndFilter(query: {
    page?: number;
    limit?: number;
    search?: string;
    category_id?: string;
    min_price?: number;
    max_price?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    all?: boolean;
  }) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    // Exclude archived by default unless requested
    if (!query.all) {
      where.is_archived = false;
    }

    if (query.category_id) {
      where.category_id = query.category_id;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.min_price !== undefined || query.max_price !== undefined) {
      where.price = {};
      if (query.min_price !== undefined) {
        where.price.gte = Number(query.min_price);
      }
      if (query.max_price !== undefined) {
        where.price.lte = Number(query.max_price);
      }
    }

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    const sortBy = query.sortBy || 'created_at';
    const sortOrder = query.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }
}
