import { Injectable } from '@nestjs/common';
import { BaseService } from '../../common/services/base.service';
import { PrismaService } from '../../database/prisma.service';
import { Category, Prisma } from '@prisma/client';

@Injectable()
export class CategoriesService extends BaseService<
  Category,
  Prisma.CategoryCreateInput,
  Prisma.CategoryUpdateInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'Category');
  }

  async findAllActive() {
    return this.prisma.category.findMany({
      where: { is_archived: false },
    });
  }
}
