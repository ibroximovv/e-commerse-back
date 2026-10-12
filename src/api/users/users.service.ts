import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { BaseService } from '../../common/services/base.service';
import { PrismaService } from '../../database/prisma.service';
import { User, Prisma, Role } from '@prisma/client';
import { UsersQueryDto } from './dto/users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { cleanFullName, normalizePhone } from '../../common/utils/phone.util';

const ALLOWED_USER_SORT_FIELDS = [
  'created_at',
  'updated_at',
  'phone',
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

  async findByPhone(phone: string): Promise<User | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    return this.prisma.user.findFirst({ where: { phone: normalized } });
  }

  /**
   * Profilni yangilaydi. Telefon login kaliti bo'lgani uchun normallashtiriladi
   * va unikalligi tekshiriladi (bazada `@unique` yo'q - sababi schema'da).
   */
  async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
    const data: Prisma.UserUpdateInput = {
      photo: dto.photo,
      language: dto.language,
    };

    if (dto.full_name !== undefined) {
      const fullName = cleanFullName(dto.full_name);
      if (!fullName) throw new BadRequestException('Full name is required');
      data.full_name = fullName;
    }

    if (dto.phone !== undefined) {
      const phone = normalizePhone(dto.phone);
      if (!phone) throw new BadRequestException('Invalid phone number');

      const owner = await this.prisma.user.findFirst({ where: { phone } });
      if (owner && owner.id !== id) {
        throw new ConflictException('Phone number already registered');
      }
      data.phone = phone;
    }

    return this.update(id, data);
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

  /**
   * Rolni almashtiradi. API orqali ADMIN yaratishning boshqa yo'li yo'q, shuning
   * uchun oxirgi adminni USER ga tushirish adminkani butunlay yopib qo'yardi -
   * bunga yo'l qo'ymaymiz.
   */
  async updateRole(id: string, role: Role, actorId?: string): Promise<User> {
    const target = await this.findOne(id);

    if (target.role === Role.ADMIN && role !== Role.ADMIN) {
      if (actorId && actorId === id) {
        throw new BadRequestException(
          'You cannot remove the ADMIN role from your own account',
        );
      }
      await this.assertNotLastAdmin(id);
    }

    return this.prisma.user.update({
      where: { id },
      data: { role },
    });
  }

  /**
   * Foydalanuvchini o'chiradi. Admin o'zini yoki oxirgi adminni o'chira olmaydi.
   */
  async removeUser(id: string, actorId?: string): Promise<User> {
    const target = await this.findOne(id);

    if (actorId && actorId === id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    if (target.role === Role.ADMIN) {
      await this.assertNotLastAdmin(id);
    }

    return this.prisma.user.delete({ where: { id } });
  }

  private async assertNotLastAdmin(id: string) {
    const otherAdmins = await this.prisma.user.count({
      where: { role: Role.ADMIN, id: { not: id } },
    });

    if (otherAdmins === 0) {
      throw new BadRequestException(
        'Cannot remove the last ADMIN account. Promote another user to ADMIN first',
      );
    }
  }

  async getStats() {
    const [total, admins] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: Role.ADMIN } }),
    ]);

    return {
      total_users: total,
      admins_count: admins,
      regular_users: total - admins,
    };
  }
}
