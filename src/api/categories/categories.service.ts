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
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  CATEGORY_SORT_FIELDS,
  CategoriesQueryDto,
} from './dto/categories-query.dto';

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
  product_count?: number;
}

/**
 * Kategoriya skeleti (id -> parent_id) juda tez-tez o'qiladi: mahsulot filtrida
 * har bir kategoriya uchun avlodlar ro'yxati kerak bo'ladi. Kategoriyalar kam
 * o'zgargani uchun qisqa muddatli kesh saqlaymiz va har qanday yozuvda tozalaymiz.
 */
const SKELETON_TTL_MS = 30_000;

interface CategorySkeletonNode {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
}

@Injectable()
export class CategoriesService extends BaseService<
  Category,
  Prisma.CategoryCreateInput,
  Prisma.CategoryUpdateInput
> {
  private skeletonCache: {
    expiresAt: number;
    childrenOf: Map<string, string[]>;
    byId: Map<string, CategorySkeletonNode>;
  } | null = null;

  constructor(prisma: PrismaService) {
    super(prisma, 'Category');
  }

  private invalidateSkeleton() {
    this.skeletonCache = null;
  }

  private async getSkeleton() {
    if (this.skeletonCache && this.skeletonCache.expiresAt > Date.now()) {
      return this.skeletonCache;
    }

    const rows = await this.prisma.category.findMany({
      select: { id: true, parent_id: true, name: true, slug: true },
    });

    const childrenOf = new Map<string, string[]>();
    const byId = new Map<string, CategorySkeletonNode>();

    for (const row of rows) {
      byId.set(row.id, row);
      if (!row.parent_id) continue;
      const bucket = childrenOf.get(row.parent_id) ?? [];
      bucket.push(row.id);
      childrenOf.set(row.parent_id, bucket);
    }

    this.skeletonCache = {
      childrenOf,
      byId,
      expiresAt: Date.now() + SKELETON_TTL_MS,
    };

    return this.skeletonCache;
  }

  // ---------------------------------------------------------------------------
  // Yozish (Admin)
  // ---------------------------------------------------------------------------

  async createCategory(dto: CreateCategoryDto): Promise<Category> {
    const { parent_id, slug, name, ...rest } = dto;

    await this.assertNameIsFree(name);

    if (parent_id) {
      await this.assertParentExists(parent_id);
    }

    const created = await this.prisma.category.create({
      data: {
        ...rest,
        name,
        parent_id: parent_id ?? null,
        slug: await this.resolveSlug(slug ?? name),
      },
    });

    this.invalidateSkeleton();
    return created;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const current = await this.findOne(id);
    const { parent_id, slug, name, is_archived, ...rest } = dto;

    if (name && name !== current.name) {
      await this.assertNameIsFree(name, id);
    }

    if (parent_id !== undefined && parent_id !== current.parent_id) {
      await this.assertValidParentMove(id, parent_id);
    }

    const data: Prisma.CategoryUncheckedUpdateInput = { ...rest };

    if (name !== undefined) data.name = name;
    if (parent_id !== undefined) data.parent_id = parent_id || null;
    if (is_archived !== undefined) data.is_archived = is_archived;
    if (slug !== undefined) {
      data.slug = await this.resolveSlug(slug || name || current.name, id);
    }

    const updated = await this.prisma.category.update({ where: { id }, data });
    this.invalidateSkeleton();

    // Arxivlash/tiklash pastga kaskad bo'ladi: ichki kategoriyalar + mahsulotlar
    if (is_archived !== undefined && is_archived !== current.is_archived) {
      await this.cascadeArchive(id, is_archived);
    }

    return updated;
  }

  /**
   * Kategoriyani o'chirish faqat u bo'sh bo'lganda ruxsat etiladi.
   * Aks holda ma'lumotlar yaxlitligi buziladi - o'rniga arxivlash tavsiya qilinadi.
   */
  async removeCategory(id: string): Promise<Category> {
    await this.findOne(id);

    const [childCount, productCount] = await Promise.all([
      this.prisma.category.count({ where: { parent_id: id } }),
      this.prisma.product.count({ where: { category_id: id } }),
    ]);

    if (childCount > 0) {
      throw new BadRequestException(
        'Category has subcategories. Archive it instead of deleting',
      );
    }

    if (productCount > 0) {
      throw new BadRequestException(
        'Category has products. Archive it instead of deleting',
      );
    }

    const deleted = await this.prisma.category.delete({ where: { id } });
    this.invalidateSkeleton();
    return deleted;
  }

  // ---------------------------------------------------------------------------
  // O'qish
  // ---------------------------------------------------------------------------

  async search(query: CategoriesQueryDto, isAdmin = false) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const skip = (page - 1) * limit;

    const where = this.buildWhere(query, isAdmin);

    // Faqat oq ro'yxatdagi maydonlar - foydalanuvchi ixtiyoriy baza maydonini yubora olmaydi
    const sortBy = (CATEGORY_SORT_FIELDS as readonly string[]).includes(
      query.sortBy ?? '',
    )
      ? (query.sortBy as string)
      : 'sort_order';
    const sortOrder = query.sortOrder ?? 'asc';

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy]: sortOrder }, { name: 'asc' }],
        include: { parent: true },
      }),
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
   * Butun kategoriya daraxtini bitta so'rovda yig'ib, xotirada quradi
   * (har bir daraja uchun alohida DB so'rov yubormaydi).
   */
  async getTree(
    options: {
      isAdmin?: boolean;
      includeArchived?: boolean;
      withProductCount?: boolean;
      rootId?: string;
    } = {},
  ): Promise<CategoryTreeNode[]> {
    const includeArchived = !!options.isAdmin && !!options.includeArchived;

    const categories = await this.prisma.category.findMany({
      where: includeArchived ? {} : { is_archived: false },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });

    const counts = options.withProductCount
      ? await this.getProductCountMap(includeArchived)
      : null;

    const nodes = new Map<string, CategoryTreeNode>();
    for (const category of categories) {
      nodes.set(category.id, {
        ...category,
        children: [],
        ...(counts ? { product_count: counts.get(category.id) ?? 0 } : {}),
      });
    }

    const roots: CategoryTreeNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // product_count ni pastdan yuqoriga yig'amiz: ota kategoriya
    // o'z bolalaridagi mahsulotlarni ham hisobga oladi
    if (counts) {
      const rollUp = (node: CategoryTreeNode): number => {
        const childTotal = node.children.reduce(
          (sum, child) => sum + rollUp(child),
          0,
        );
        node.product_count = (node.product_count ?? 0) + childTotal;
        return node.product_count;
      };
      roots.forEach(rollUp);
    }

    if (options.rootId) {
      const subtree = nodes.get(options.rootId);
      if (!subtree) {
        throw new NotFoundException(
          `Category with ID ${options.rootId} not found`,
        );
      }
      return [subtree];
    }

    return roots;
  }

  async findBySlug(slug: string, isAdmin = false): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: {
          where: isAdmin ? {} : { is_archived: false },
          orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        },
      },
    });

    if (!category || (!isAdmin && category.is_archived)) {
      throw new NotFoundException(`Category with slug ${slug} not found`);
    }

    return category;
  }

  async findOneDetailed(id: string, isAdmin = false) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          where: isAdmin ? {} : { is_archived: false },
          orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        },
      },
    });

    if (!category || (!isAdmin && category.is_archived)) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    const [breadcrumbs, productCount] = await Promise.all([
      this.getBreadcrumbs(category.id),
      this.prisma.product.count({
        where: {
          category_id: { in: await this.getDescendantIds(category.id) },
          ...(isAdmin ? {} : { is_archived: false }),
        },
      }),
    ]);

    return { ...category, breadcrumbs, product_count: productCount };
  }

  /**
   * Sahifa boshidagi "Electronics / Phones / Smartphones" zanjiri.
   */
  async getBreadcrumbs(
    id: string,
  ): Promise<Array<{ id: string; name: string; slug: string }>> {
    const { byId } = await this.getSkeleton();

    const chain: Array<{ id: string; name: string; slug: string }> = [];
    let currentId: string | null = id;
    const guard = new Set<string>(); // sikldan himoya

    while (currentId && !guard.has(currentId)) {
      guard.add(currentId);
      const node = byId.get(currentId);
      if (!node) break;
      chain.unshift({ id: node.id, name: node.name, slug: node.slug });
      currentId = node.parent_id;
    }

    return chain;
  }

  /**
   * Kategoriya va uning barcha avlodlari ID'lari.
   * Mahsulotlarni filtrlashda "ota kategoriyani tanlasam, ichidagilari ham chiqsin"
   * talabini bajarish uchun ishlatiladi.
   */
  async getDescendantIds(id: string): Promise<string[]> {
    const { childrenOf } = await this.getSkeleton();

    const result: string[] = [];
    const queue = [id];
    const seen = new Set<string>();

    while (queue.length) {
      const currentId = queue.shift()!;
      if (seen.has(currentId)) continue;
      seen.add(currentId);
      result.push(currentId);
      queue.push(...(childrenOf.get(currentId) ?? []));
    }

    return result;
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

    if (query.root_only) {
      where.parent_id = null;
    } else if (query.parent_id) {
      where.parent_id = query.parent_id;
    }

    if (query.is_featured !== undefined) {
      where.is_featured = query.is_featured;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: slugify(query.search), mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async attachProductCounts(categories: Category[], isAdmin: boolean) {
    const counts = await this.getProductCountMap(isAdmin);
    return categories.map((category) => ({
      ...category,
      product_count: counts.get(category.id) ?? 0,
    }));
  }

  /** Bitta so'rov davomida takroriy daraxt o'qishlarini kamaytiradi. */
  private async getProductCountMap(includeArchived: boolean) {
    const grouped = await this.prisma.product.groupBy({
      by: ['category_id'],
      where: includeArchived ? {} : { is_archived: false },
      _count: { _all: true },
    });

    return new Map(
      grouped.map((row) => [row.category_id, row._count._all] as const),
    );
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

  private async assertNameIsFree(name: string, excludeId?: string) {
    const existing = await this.prisma.category.findUnique({
      where: { name },
      select: { id: true },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Category with this name already exists');
    }
  }

  private async assertParentExists(parentId: string) {
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true },
    });
    if (!parent) {
      throw new NotFoundException(`Category with ID ${parentId} not found`);
    }
  }

  /**
   * Kategoriyani o'z avlodi ostiga ko'chirish daraxtda sikl hosil qiladi - bloklaymiz.
   */
  private async assertValidParentMove(id: string, parentId?: string) {
    if (!parentId) return;

    if (parentId === id) {
      throw new BadRequestException('Category cannot be its own parent');
    }

    await this.assertParentExists(parentId);

    const descendants = await this.getDescendantIds(id);
    if (descendants.includes(parentId)) {
      throw new BadRequestException(
        'Cannot move a category into its own subcategory',
      );
    }
  }

  private async cascadeArchive(id: string, isArchived: boolean) {
    const ids = await this.getDescendantIds(id);

    await this.prisma.$transaction([
      this.prisma.category.updateMany({
        where: { id: { in: ids } },
        data: { is_archived: isArchived },
      }),
      this.prisma.product.updateMany({
        where: { category_id: { in: ids } },
        data: { is_archived: isArchived },
      }),
    ]);
  }
}
