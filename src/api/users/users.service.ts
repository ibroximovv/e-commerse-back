import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseService } from '../../common/services/base.service';
import { PrismaService } from '../../database/prisma.service';
import { User, Prisma, Role } from '@prisma/client';
import { UsersQueryDto } from './dto/users-query.dto';

const ALLOWED_USER_SORT_FIELDS = [
  'created_at',
  'updated_at',
  'email',
  'full_name',
  'role',
] as const;

@Injectable()
export class UsersService extends BaseService<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'User');
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async search(query: UsersQueryDto) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (query.role) {
      where.role = query.role;
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { email: { contains: term, mode: 'insensitive' } },
        { full_name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    const sortBy = (ALLOWED_USER_SORT_FIELDS as readonly string[]).includes(
      query.sortBy ?? '',
    )
      ? (query.sortBy as string)
      : 'created_at';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.user.count({ where }),
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

  async updateRole(id: string, role: Role): Promise<User> {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { role },
    });
  }

  async getStats() {
    const [total, verified, admins] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { is_verified: true } }),
      this.prisma.user.count({ where: { role: Role.ADMIN } }),
    ]);

    return {
      total_users: total,
      verified_users: verified,
      admins_count: admins,
      regular_users: total - admins,
    };
  }
}
