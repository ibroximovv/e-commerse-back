import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseService } from '../../common/services/base.service';
import { PrismaService } from '../../database/prisma.service';
import { Category, Prisma } from '@prisma/client';
import { generateUniqueSlug, slugify } from '../../common/utils/slug.util';
import {
  DEFAULT_LANGUAGE,
  Lang,
  SUPPORTED_LANGUAGES,
  spreadLocalized,
  spreadLocalizedRequired,
} from '../../common/i18n/locale';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  CATEGORY_SORT_FIELDS,
  CategoriesQueryDto,
} from './dto/categories-query.dto';

/**
 * Katalog tekis: OCO katalogida 8 ta bo'lim bor va ichki kategoriya yo'q.
 * Shuning uchun daraxt (parent/children, breadcrumbs, avlodlar keshi) bu
 * servisda umuman yo'q - kategoriya oddiy ro'yxat.
 */
@Injectable()
export class CategoriesService extends BaseService<
  Category,
  Prisma.CategoryCreateInput,
  Prisma.CategoryUpdateInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'Category');
  }

  // ---------------------------------------------------------------------------
  // Yozish (Admin)
  // ---------------------------------------------------------------------------

  async createCategory(dto: CreateCategoryDto): Promise<Category> {
    const { name, description, slug, ...rest } = dto;

    const names = spreadLocalizedRequired('name', name);
    await this.assertNameIsFree(names);

    return this.prisma.category.create({
      data: {
        ...rest,
        ...names,
        ...spreadLocalized('description', description),
        slug: await this.resolveSlug(slug ?? pickAnyName(name)),
      },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const current = await this.findOne(id);
    const { name, description, slug, is_archived, ...rest } = dto;

    const data: Prisma.CategoryUncheckedUpdateInput = {
      ...rest,
      ...spreadLocalized('description', description),
    };

    if (name) {
      // Yuborilmagan tillar joriy qiymatida qoladi
      const merged = spreadLocalizedRequired('name', {
        uz: name.uz ?? current.name_uz,
        ru: name.ru ?? current.name_ru,
        en: name.en ?? current.name_en,
      });
      await this.assertNameIsFree(merged, id);
      Object.assign(data, merged);
    }

    if (is_archived !== undefined) data.is_archived = is_archived;

    if (slug !== undefined) {
      const source =
        slug || (name ? pickAnyName(name) : undefined) || current.name_uz;
      data.slug = await this.resolveSlug(source, id);
    }

    const updated = await this.prisma.category.update({ where: { id }, data });

    // Arxivlash/tiklash kategoriyadagi mahsulotlarga ham tarqaladi
    if (is_archived !== undefined && is_archived !== current.is_archived) {
      await this.prisma.product.updateMany({
        where: { category_id: id },
        data: { is_archived },
      });
    }

    return updated;
  }

  /**
   * Kategoriyani o'chirish faqat u bo'sh bo'lganda ruxsat etiladi.
   * Aks holda mahsulotlar egasiz qoladi - o'rniga arxivlash tavsiya qilinadi.
   */
  async removeCategory(id: string): Promise<Category> {
    await this.findOne(id);

    const productCount = await this.prisma.product.count({
      where: { category_id: id },
    });

    if (productCount > 0) {
      throw new BadRequestException(
        'Category has products. Archive it instead of deleting',
      );
    }

    return this.prisma.category.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // O'qish
  // ---------------------------------------------------------------------------

  async search(
    query: CategoriesQueryDto,
    isAdmin = false,
    lang: Lang = DEFAULT_LANGUAGE,
  ) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 100);
    const skip = (page - 1) * limit;

    const where = this.buildWhere(query, isAdmin);
    const orderBy = buildCategoryOrderBy(query, lang);

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({ where, skip, take: limit, orderBy }),
      this.prisma.category.count({ where }),
    ]);

    const enriched = query.with_product_count
      ? await this.attachProductCounts(data, isAdmin)
      : data;

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  /**
   * Menyu uchun to'liq ro'yxat (sahifalashsiz). Ilgari `getTree` bo'lgan -
   * katalog tekis bo'lgani uchun endi oddiy tartiblangan ro'yxat qaytadi.
   */
  async listAll(
    options: {
      isAdmin?: boolean;
      includeArchived?: boolean;
      withProductCount?: boolean;
      lang?: Lang;
    } = {},
  ) {
    const includeArchived = !!options.isAdmin && !!options.includeArchived;
    const lang = options.lang ?? DEFAULT_LANGUAGE;

    const categories = await this.prisma.category.findMany({
      where: includeArchived ? {} : { is_archived: false },
      orderBy: [{ sort_order: 'asc' }, { [`name_${lang}`]: 'asc' }],
    });

    if (!options.withProductCount) return categories;

    return this.attachProductCounts(categories, includeArchived);
  }

  async findBySlug(slug: string, isAdmin = false): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { slug } });

    if (!category || (!isAdmin && category.is_archived)) {
      throw new NotFoundException(`Category with slug ${slug} not found`);
    }

    return category;
  }

  async findOneDetailed(id: string, isAdmin = false) {
    const category = await this.prisma.category.findUnique({ where: { id } });

    if (!category || (!isAdmin && category.is_archived)) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    const productCount = await this.prisma.product.count({
      where: {
        category_id: id,
        ...(isAdmin ? {} : { is_archived: false }),
      },
    });

    return { ...category, product_count: productCount };
  }

  async resolveIdBySlug(slug: string): Promise<string> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with slug ${slug} not found`);
    }

    return category.id;
  }

  // ---------------------------------------------------------------------------
  // Ichki yordamchilar
  // ---------------------------------------------------------------------------

  private buildWhere(
    query: CategoriesQueryDto,
    isAdmin: boolean,
  ): Prisma.CategoryWhereInput {
    const where: Prisma.CategoryWhereInput = {};

    // Arxivlangan kategoriyalarni faqat admin ko'ra oladi
    if (!isAdmin || !query.include_archived) {
      where.is_archived = false;
    }

    if (query.is_featured !== undefined) {
      where.is_featured = query.is_featured;
    }

    if (query.search) {
      const term = query.search.trim();
      // Qidiruv barcha tillarda ishlaydi: ruscha yozilgan so'rov o'zbekcha
      // interfeysda ham natija berishi kerak
      where.OR = [
        ...SUPPORTED_LANGUAGES.flatMap((lang) => [
          { [`name_${lang}`]: { contains: term, mode: 'insensitive' } },
          { [`description_${lang}`]: { contains: term, mode: 'insensitive' } },
        ]),
        { slug: { contains: slugify(term), mode: 'insensitive' } },
      ] as Prisma.CategoryWhereInput[];
    }

    return where;
  }

  private async attachProductCounts(
    categories: Category[],
    includeArchived: boolean,
  ) {
    const grouped = await this.prisma.product.groupBy({
      by: ['category_id'],
      where: includeArchived ? {} : { is_archived: false },
      _count: { _all: true },
    });

    const counts = new Map(
      grouped.map((row) => [row.category_id, row._count._all] as const),
    );

    return categories.map((category) => ({
      ...category,
      product_count: counts.get(category.id) ?? 0,
    }));
  }

  private async resolveSlug(source: string, excludeId?: string) {
    return generateUniqueSlug(
      source,
      async (candidate) => {
        const existing = await this.prisma.category.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return !!existing && existing.id !== excludeId;
      },
      'category',
    );
  }

  /**
   * Nom unikalligi har bir tilda alohida tekshiriladi.
   *
   * Bazada `@unique` qo'yilmagan: uchta ustunga alohida unique indeks qo'yilsa,
   * bir xil matnli ikkita til (masalan `name_ru === name_en`) yoki bo'sh
   * qiymatlar to'qnashib ketardi.
   */
  private async assertNameIsFree(
    names: Record<string, string>,
    excludeId?: string,
  ) {
    const filled = SUPPORTED_LANGUAGES.map((lang) => ({
      lang,
      value: names[`name_${lang}`],
    })).filter((item) => item.value?.trim());

    if (!filled.length) return;

    const existing = await this.prisma.category.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: filled.map((item) => ({
          [`name_${item.lang}`]: { equals: item.value, mode: 'insensitive' },
        })),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }
  }
}

/**
 * `sortBy=name` so'ralganda joriy til ustuni bo'yicha saralaymiz - aks holda
 * o'zbekcha interfeysda ro'yxat ruscha alifbo tartibida chiqib qolardi.
 */
function buildCategoryOrderBy(
  query: CategoriesQueryDto,
  lang: Lang,
): Prisma.CategoryOrderByWithRelationInput[] {
  const sortOrder = query.sortOrder ?? 'asc';
  const requested = (CATEGORY_SORT_FIELDS as readonly string[]).includes(
    query.sortBy ?? '',
  )
    ? (query.sortBy as string)
    : 'sort_order';

  const field = requested === 'name' ? `name_${lang}` : requested;

  return [{ [field]: sortOrder }, { [`name_${lang}`]: 'asc' }];
}

/** Slug uchun manba: mavjud bo'lgan birinchi til. */
function pickAnyName(name: { uz?: string; ru?: string; en?: string }): string {
  return name.uz?.trim() || name.ru?.trim() || name.en?.trim() || 'category';
}
