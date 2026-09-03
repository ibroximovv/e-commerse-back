import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseService } from '../../common/services/base.service';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, Product } from '@prisma/client';
import { CategoriesService } from '../categories/categories.service';
import { generateUniqueSlug, slugify } from '../../common/utils/slug.util';
import {
  DEFAULT_LANGUAGE,
  Lang,
  SUPPORTED_LANGUAGES,
  pickLocalized,
  spreadLocalized,
  spreadLocalizedRequired,
} from '../../common/i18n/locale';
import {
  CreateProductDto,
  ProductAttributeDto,
} from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  ProductsFilterQueryDto,
  ProductSortOption,
} from './dto/products-filter-query.dto';
import {
  computePopularityScore,
  computePriceFields,
  POPULARITY_WEIGHTS,
} from './products.pricing';

/** Omborda "oz qoldi" deb hisoblanadigan chegara. */
const LOW_STOCK_THRESHOLD = 5;

/** Fasetlar uchun xotirada tahlil qilinadigan maksimal mahsulot soni. */
const FACET_SCAN_LIMIT = 2000;

type SortInput = Prisma.ProductOrderByWithRelationInput[];

/**
 * Har bir sort preseti uchun xavfsiz `orderBy`. Foydalanuvchi baza maydonini
 * yubora olmaydi. `name_asc`/`name_desc` bu yerda yo'q - ular joriy tilga
 * bog'liq va `buildOrderBy` da hosil qilinadi.
 */
const SORT_STRATEGIES: Record<
  Exclude<ProductSortOption, 'name_asc' | 'name_desc'>,
  SortInput
> = {
  relevance: [
    { is_top: 'desc' },
    { popularity_score: 'desc' },
    { created_at: 'desc' },
  ],
  newest: [{ created_at: 'desc' }],
  oldest: [{ created_at: 'asc' }],
  price_asc: [{ final_price: 'asc' }],
  price_desc: [{ final_price: 'desc' }],
  popular: [{ sales_count: 'desc' }, { popularity_score: 'desc' }],
  top_rated: [{ rating: 'desc' }, { rating_count: 'desc' }],
  most_viewed: [{ view_count: 'desc' }],
  discount: [{ discount_percent: 'desc' }, { final_price: 'asc' }],
};

/** `sortBy` orqali to'g'ridan-to'g'ri ruxsat etilgan maydonlar (eski frontend bilan moslik). */
const ALLOWED_SORT_FIELDS = [
  'created_at',
  'updated_at',
  'name',
  'price',
  'final_price',
  'discount_percent',
  'stock',
  'rating',
  'sales_count',
  'view_count',
  'popularity_score',
] as const;

const PRODUCT_LIST_INCLUDE = {
  category: {
    select: {
      id: true,
      slug: true,
      name_uz: true,
      name_ru: true,
      name_en: true,
    },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService extends BaseService<
  Product,
  Prisma.ProductCreateInput,
  Prisma.ProductUpdateInput
> {
  constructor(
    prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
  ) {
    super(prisma, 'Product');
  }

  // ---------------------------------------------------------------------------
  // Yozish (Admin)
  // ---------------------------------------------------------------------------

  async createProduct(dto: CreateProductDto): Promise<Product> {
    const {
      category_id,
      slug,
      sku,
      name,
      description,
      attributes,
      discount_price,
      price,
      price_on_request,
      ...rest
    } = dto;

    await this.assertCategoryUsable(category_id);

    // "Narx kelishilgan holda" tovarda narx ham, chegirma ham saqlanmaydi
    const onRequest = price_on_request ?? false;
    const nextPrice = onRequest ? 0 : price;
    const nextDiscount = onRequest ? null : (discount_price ?? null);
    this.assertDiscountValid(nextPrice, nextDiscount);

    const normalizedSku = normalizeSku(sku);
    if (normalizedSku) await this.assertSkuIsFree(normalizedSku);

    return this.prisma.product.create({
      data: {
        ...rest,
        ...spreadLocalizedRequired('name', name),
        ...spreadLocalized('description', description),
        attributes: toAttributeColumns(attributes),
        price: nextPrice,
        price_on_request: onRequest,
        discount_price: nextDiscount,
        ...computePriceFields(nextPrice, nextDiscount),
        sku: normalizedSku,
        slug: await this.resolveSlug(slug ?? pickAnyText(name)),
        category_id,
      },
      include: PRODUCT_LIST_INCLUDE,
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto): Promise<Product> {
    const current = await this.findOne(id);
    const {
      category_id,
      slug,
      sku,
      name,
      description,
      attributes,
      discount_price,
      price,
      price_on_request,
      ...rest
    } = dto;

    if (category_id && category_id !== current.category_id) {
      await this.assertCategoryUsable(category_id);
    }

    const normalizedSku = sku === undefined ? undefined : normalizeSku(sku);
    if (normalizedSku && normalizedSku !== current.sku) {
      await this.assertSkuIsFree(normalizedSku, id);
    }

    // Narx yoki chegirma o'zgarsa - ikkalasini ham qayta baholaymiz
    const onRequest = price_on_request ?? current.price_on_request;
    const nextPrice = onRequest ? 0 : (price ?? current.price);
    const nextDiscount = onRequest
      ? null
      : discount_price !== undefined
        ? discount_price
        : current.discount_price;
    this.assertDiscountValid(nextPrice, nextDiscount);

    const data: Prisma.ProductUncheckedUpdateInput = {
      ...rest,
      ...spreadLocalized('description', description),
      ...computePriceFields(nextPrice, nextDiscount),
      price: nextPrice,
      price_on_request: onRequest,
      discount_price: nextDiscount ?? null,
    };

    if (name) {
      // Yuborilmagan tillar joriy qiymatida qoladi
      Object.assign(
        data,
        spreadLocalizedRequired('name', {
          uz: name.uz ?? current.name_uz,
          ru: name.ru ?? current.name_ru,
          en: name.en ?? current.name_en,
        }),
      );
    }

    if (attributes !== undefined) {
      data.attributes = toAttributeColumns(attributes);
    }

    if (category_id !== undefined) data.category_id = category_id;
    if (normalizedSku !== undefined) data.sku = normalizedSku;
    if (slug !== undefined) {
      const source =
        slug || (name ? pickAnyText(name) : undefined) || current.name_uz;
      data.slug = await this.resolveSlug(source, id);
    }

    return this.prisma.product.update({
      where: { id },
      data,
      include: PRODUCT_LIST_INCLUDE,
    });
  }

  async setFlags(
    id: string,
    flags: { is_top?: boolean; is_featured?: boolean; is_archived?: boolean },
  ): Promise<Product> {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: flags,
      include: PRODUCT_LIST_INCLUDE,
    });
  }

  async adjustStock(id: string, quantity: number): Promise<Product> {
    const product = await this.findOne(id);
    const nextStock = product.stock + quantity;

    if (nextStock < 0) {
      throw new BadRequestException(
        `Insufficient stock for product "${product.name_uz}"`,
      );
    }

    return this.prisma.product.update({
      where: { id },
      data: { stock: nextStock },
      include: PRODUCT_LIST_INCLUDE,
    });
  }

  /** Bir nechta mahsulotni bir vaqtda arxivlash/tiklash (admin panel uchun). */
  async bulkArchive(ids: string[], isArchived: boolean) {
    const result = await this.prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { is_archived: isArchived },
    });
    return { updated: result.count };
  }

  // ---------------------------------------------------------------------------
  // Qidiruv va filtr
  // ---------------------------------------------------------------------------

  async searchAndFilter(
    query: ProductsFilterQueryDto,
    isAdmin = false,
    lang: Lang = DEFAULT_LANGUAGE,
  ) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 100);
    const skip = (page - 1) * limit;

    const where = await this.buildWhere(query, isAdmin);
    const orderBy = this.buildOrderBy(query, lang);

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: PRODUCT_LIST_INCLUDE,
      }),
      this.prisma.product.count({ where }),
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
        sort: this.resolveSortLabel(query),
        ...(query.with_facets
          ? { facets: await this.buildFacets(query, isAdmin, lang) }
          : {}),
      },
    };
  }

  /**
   * Filtr panelini qurish uchun mavjud qiymatlar: narx oralig'i, brendlar,
   * kategoriyalar va atributlar. `?with_facets=true` bilan `GET /api/products` ichida ham keladi.
   */
  async getFilterOptions(
    query: ProductsFilterQueryDto,
    isAdmin = false,
    lang: Lang = DEFAULT_LANGUAGE,
  ) {
    return this.buildFacets(query, isAdmin, lang);
  }

  // ---------------------------------------------------------------------------
  // Tayyor to'plamlar (bosh sahifa bloklari)
  // ---------------------------------------------------------------------------

  /**
   * TOP mahsulotlar: avval admin qo'lda belgilaganlari, keyin
   * sotuv/reyting/ko'rishdan hosil qilingan `popularity_score` bo'yicha.
   */
  async getTopProducts(options: CollectionOptions = {}) {
    return this.getCollection(
      { sort: 'relevance', is_top: options.onlyManual ? true : undefined },
      options,
    );
  }

  /** Eng ko'p sotilganlar. Hech qachon sotilmaganlar ro'yxatga tushmaydi. */
  async getBestSellers(options: CollectionOptions = {}) {
    return this.getCollection({ sort: 'popular' }, options, {
      sales_count: { gt: 0 },
    });
  }

  /** Admin tanlagan "tanlangan mahsulotlar" bloki. */
  async getFeaturedProducts(options: CollectionOptions = {}) {
    return this.getCollection(
      { sort: 'relevance', is_featured: true },
      options,
    );
  }

  /** Yangi kelganlar. */
  async getNewArrivals(options: CollectionOptions = {}) {
    return this.getCollection(
      { sort: 'newest', new_within_days: options.withinDays },
      options,
    );
  }

  /** Chegirmadagi mahsulotlar (aksiya bloki). */
  async getDiscountedProducts(options: CollectionOptions = {}) {
    return this.getCollection(
      { sort: 'discount', has_discount: true },
      options,
    );
  }

  /** Eng yuqori baholanganlar. Kamida 1 ta baho bo'lishi shart. */
  async getTopRatedProducts(options: CollectionOptions = {}) {
    return this.getCollection({ sort: 'top_rated' }, options, {
      rating_count: { gt: 0 },
    });
  }

  /**
   * O'xshash mahsulotlar - shu kategoriyaning boshqa tovarlari.
   * Katalog tekis bo'lgani uchun "qardosh kategoriya" tushunchasi yo'q.
   */
  async getRelatedProducts(id: string, limit = 10) {
    const product = await this.findOne(id);
    const take = Math.min(Math.max(limit, 1), 50);

    return this.prisma.product.findMany({
      where: {
        is_archived: false,
        category_id: product.category_id,
        id: { not: product.id },
      },
      take,
      orderBy: SORT_STRATEGIES.relevance,
      include: PRODUCT_LIST_INCLUDE,
    });
  }

  // ---------------------------------------------------------------------------
  // Bitta mahsulot
  // ---------------------------------------------------------------------------

  async findOneDetailed(id: string, isAdmin = false) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_LIST_INCLUDE,
    });

    if (!product || (!isAdmin && product.is_archived)) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return this.decorateDetail(product, isAdmin);
  }

  async findBySlug(slug: string, isAdmin = false) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: PRODUCT_LIST_INCLUDE,
    });

    if (!product || (!isAdmin && product.is_archived)) {
      throw new NotFoundException(`Product with slug ${slug} not found`);
    }

    return this.decorateDetail(product, isAdmin);
  }

  // ---------------------------------------------------------------------------
  // Hosila maydonlarni yangilash
  // ---------------------------------------------------------------------------

  /**
   * Buyurtma rasmiylashtirilganda chaqiriladi. `tx` berilsa - checkout
   * tranzaksiyasi ichida bajariladi, ya'ni sotuv soni va zaxira birga o'zgaradi.
   */
  async registerSale(
    productId: string,
    quantity: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.product.update({
      where: { id: productId },
      data: {
        sales_count: { increment: quantity },
        popularity_score: { increment: quantity * POPULARITY_WEIGHTS.sale },
      },
    });
  }

  /** Reyting o'zgargach `popularity_score` ni to'liq qayta hisoblaydi. */
  async recalculatePopularity(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        sales_count: true,
        rating: true,
        rating_count: true,
        view_count: true,
      },
    });

    if (!product) return null;

    return this.prisma.product.update({
      where: { id: productId },
      data: { popularity_score: computePopularityScore(product) },
    });
  }

  // ---------------------------------------------------------------------------
  // Ichki yordamchilar
  // ---------------------------------------------------------------------------

  private decorateDetail(
    product: Product & { category?: unknown },
    isAdmin: boolean,
  ) {
    // Ko'rishlar sonini faqat mijoz ochganda oshiramiz, admin panel statistikani buzmasin
    if (!isAdmin) {
      void this.prisma.product
        .update({
          where: { id: product.id },
          data: {
            view_count: { increment: 1 },
            popularity_score: { increment: POPULARITY_WEIGHTS.view },
          },
        })
        .catch(() => undefined);
    }

    return {
      ...product,
      stock_status: this.resolveStockStatus(product.stock),
      is_new: this.isNew(product.created_at),
    };
  }

  private resolveStockStatus(stock: number) {
    if (stock <= 0) return 'out_of_stock';
    if (stock <= LOW_STOCK_THRESHOLD) return 'low_stock';
    return 'in_stock';
  }

  private isNew(createdAt: Date, days = 30) {
    return Date.now() - createdAt.getTime() <= days * 24 * 60 * 60 * 1000;
  }

  private async buildWhere(
    query: ProductsFilterQueryDto,
    isAdmin: boolean,
  ): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = {};
    const and: Prisma.ProductWhereInput[] = [];

    // Arxivlangan mahsulotlarni faqat admin ko'ra oladi
    const wantsArchived = query.include_archived ?? query.all ?? false;
    if (!isAdmin || !wantsArchived) {
      where.is_archived = false;
    }

    const categoryIds = await this.resolveCategoryIds(query);
    if (categoryIds) {
      where.category_id =
        categoryIds.length === 1 ? categoryIds[0] : { in: categoryIds };
    }

    if (query.search) {
      const term = query.search.trim();
      // Qidiruv uchala tilda: ruscha katalogdan qidirilgan so'z o'zbekcha
      // interfeysda ham topilishi kerak
      and.push({
        OR: [
          ...SUPPORTED_LANGUAGES.flatMap((lang) => [
            { [`name_${lang}`]: { contains: term, mode: 'insensitive' } },
            {
              [`description_${lang}`]: {
                contains: term,
                mode: 'insensitive',
              },
            },
          ]),
          { brand: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { slug: { contains: slugify(term) } },
          { tags: { has: term.toLowerCase() } },
        ] as Prisma.ProductWhereInput[],
      });
    }

    // Narx filtri hosila `final_price` ustida - chegirma avtomatik hisobga olinadi
    if (query.min_price !== undefined || query.max_price !== undefined) {
      where.final_price = {
        ...(query.min_price !== undefined ? { gte: query.min_price } : {}),
        ...(query.max_price !== undefined ? { lte: query.max_price } : {}),
      };
    }

    if (query.price_on_request !== undefined) {
      where.price_on_request = query.price_on_request;
    }

    if (query.has_discount) {
      where.discount_percent = { gt: 0 };
    }
    if (query.min_discount_percent !== undefined) {
      where.discount_percent = {
        ...(typeof where.discount_percent === 'object'
          ? where.discount_percent
          : {}),
        gte: query.min_discount_percent,
      };
    }

    if (query.brands?.length) {
      // `in` registrga sezgir bo'lgani uchun har bir brend uchun alohida
      // registrga befarq `equals` ishlatamiz (`?brands=oco` ham `OCO` ni topadi)
      and.push({
        OR: query.brands.map((brand) => ({
          brand: { equals: brand, mode: 'insensitive' as const },
        })),
      });
    }

    if (query.tags?.length) {
      where.tags = { hasSome: query.tags.map((tag) => tag.toLowerCase()) };
    }

    // `Power:250,Power:370,Material:Copper` -> (250 YOKI 370) VA Copper
    for (const group of this.groupAttributeFilters(query.attributes)) {
      and.push({
        OR: group.values.flatMap((value) =>
          // Faset `_en` variantini identifikator sifatida beradi, lekin qo'lda
          // yozilgan ruscha/o'zbekcha so'rov ham ishlashi kerak
          SUPPORTED_LANGUAGES.map((lang) => ({
            attributes: {
              some: {
                [`key_${lang}`]: { equals: group.key, mode: 'insensitive' },
                [`value_${lang}`]: { equals: value, mode: 'insensitive' },
              },
            },
          })),
        ),
      });
    }

    const stockStatus =
      query.stock_status ?? (query.in_stock ? 'in_stock' : undefined);
    if (stockStatus === 'in_stock') {
      where.stock = { gt: 0 };
    } else if (stockStatus === 'out_of_stock') {
      where.stock = { lte: 0 };
    } else if (stockStatus === 'low_stock') {
      where.stock = { gt: 0, lte: LOW_STOCK_THRESHOLD };
    }

    if (query.min_rating !== undefined) {
      where.rating = { gte: query.min_rating };
    }

    if (query.is_top !== undefined) where.is_top = query.is_top;
    if (query.is_featured !== undefined) where.is_featured = query.is_featured;

    if (query.new_within_days !== undefined) {
      const since = new Date();
      since.setDate(since.getDate() - query.new_within_days);
      where.created_at = { gte: since };
    }

    if (and.length) where.AND = and;

    return where;
  }

  /**
   * `category_slug` / `category_id` / `category_ids` ni yakuniy ID ro'yxatiga
   * aylantiradi. Katalog tekis bo'lgani uchun avlodlarni kengaytirish yo'q.
   */
  private async resolveCategoryIds(
    query: ProductsFilterQueryDto,
  ): Promise<string[] | null> {
    const explicit = [
      ...(query.category_id ? [query.category_id] : []),
      ...(query.category_ids ?? []),
    ];

    if (query.category_slug) {
      explicit.push(
        await this.categoriesService.resolveIdBySlug(query.category_slug),
      );
    }

    return explicit.length ? [...new Set(explicit)] : null;
  }

  private groupAttributeFilters(attributes?: string[]) {
    if (!attributes?.length) return [];

    const grouped = new Map<string, string[]>();
    for (const entry of attributes) {
      const separatorIndex = entry.indexOf(':');
      if (separatorIndex <= 0) continue;

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (!key || !value) continue;

      const bucket = grouped.get(key) ?? [];
      bucket.push(value);
      grouped.set(key, bucket);
    }

    return [...grouped.entries()].map(([key, values]) => ({ key, values }));
  }

  private usesLegacySort(query: ProductsFilterQueryDto): boolean {
    return (
      !query.sort &&
      !!query.sortBy &&
      (ALLOWED_SORT_FIELDS as readonly string[]).includes(query.sortBy)
    );
  }

  private buildOrderBy(query: ProductsFilterQueryDto, lang: Lang): SortInput {
    // Nom bo'yicha saralash joriy til ustunida bajariladi - aks holda
    // o'zbekcha interfeysda ro'yxat ruscha alifbo tartibida chiqib qolardi
    if (query.sort === 'name_asc') return [{ [`name_${lang}`]: 'asc' }];
    if (query.sort === 'name_desc') return [{ [`name_${lang}`]: 'desc' }];
    if (query.sort) return SORT_STRATEGIES[query.sort];

    // Eski frontend `sortBy` + `sortOrder` yuborishi mumkin - faqat oq ro'yxatdagi maydonlar
    if (this.usesLegacySort(query)) {
      const field =
        query.sortBy === 'name' ? `name_${lang}` : (query.sortBy as string);
      return [{ [field]: query.sortOrder ?? 'desc' }];
    }

    return SORT_STRATEGIES.relevance;
  }

  /** `meta.sort` haqiqatda qo'llangan tartibni ko'rsatadi (rad etilgan `sortBy` emas). */
  private resolveSortLabel(query: ProductsFilterQueryDto): string {
    if (query.sort) return query.sort;
    if (this.usesLegacySort(query)) {
      return `${query.sortBy}:${query.sortOrder ?? 'desc'}`;
    }
    return 'relevance';
  }

  private async buildFacets(
    query: ProductsFilterQueryDto,
    isAdmin: boolean,
    lang: Lang,
  ) {
    // Fasetlar joriy filtr ostida hisoblanadi, lekin narx oralig'i keng bo'lishi uchun
    // narx filtrisiz variant ham beriladi
    const where = await this.buildWhere(query, isAdmin);
    const whereWithoutPrice = await this.buildWhere(
      { ...query, min_price: undefined, max_price: undefined },
      isAdmin,
    );

    const [priceRange, categoryGroups, brandGroups, attributeSample, counts] =
      await Promise.all([
        this.prisma.product.aggregate({
          // Narxi kelishiladigan tovarlarda `final_price` 0 - ular oralig'ni
          // pastga tortib yubormasligi uchun fasetdan chiqarib tashlanadi
          where: { ...whereWithoutPrice, price_on_request: false },
          _min: { final_price: true },
          _max: { final_price: true },
        }),
        this.prisma.product.groupBy({
          by: ['category_id'],
          where,
          _count: { _all: true },
        }),
        this.prisma.product.groupBy({
          by: ['brand'],
          where,
          _count: { _all: true },
        }),
        this.prisma.product.findMany({
          where,
          select: { attributes: true },
          take: FACET_SCAN_LIMIT,
        }),
        Promise.all([
          this.prisma.product.count({ where: { ...where, stock: { gt: 0 } } }),
          this.prisma.product.count({
            where: { ...where, discount_percent: { gt: 0 } },
          }),
          this.prisma.product.count({
            where: { ...where, rating: { gte: 4 } },
          }),
        ]),
      ]);

    const categoryIds = categoryGroups.map((group) => group.category_id);
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: {
        id: true,
        slug: true,
        name_uz: true,
        name_ru: true,
        name_en: true,
      },
    });
    const categoryById = new Map(categories.map((item) => [item.id, item]));

    const [inStockCount, discountedCount, highRatedCount] = counts;

    return {
      price: {
        min: priceRange._min.final_price ?? 0,
        max: priceRange._max.final_price ?? 0,
      },
      categories: categoryGroups
        .map((group) => {
          const category = categoryById.get(group.category_id);
          return {
            id: group.category_id,
            name: category
              ? pickLocalized(
                  {
                    uz: category.name_uz,
                    ru: category.name_ru,
                    en: category.name_en,
                  },
                  lang,
                )
              : null,
            slug: category?.slug ?? null,
            count: group._count._all,
          };
        })
        .filter((item) => item.name !== null)
        .sort((a, b) => b.count - a.count),
      brands: brandGroups
        .filter((group) => !!group.brand)
        .map((group) => ({
          value: group.brand as string,
          count: group._count._all,
        }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
      attributes: aggregateAttributeFacets(attributeSample, lang),
      counts: {
        in_stock: inStockCount,
        discounted: discountedCount,
        rating_4_plus: highRatedCount,
      },
      // Fasetlar katta katalogda birinchi `FACET_SCAN_LIMIT` mahsulot bo'yicha hisoblanadi
      attributes_sampled: attributeSample.length >= FACET_SCAN_LIMIT,
    };
  }

  private async getCollection(
    baseQuery: Partial<ProductsFilterQueryDto>,
    options: CollectionOptions,
    extraWhere?: Prisma.ProductWhereInput,
  ) {
    const query = {
      ...baseQuery,
      category_id: options.categoryId,
      category_slug: options.categorySlug,
      limit: Math.min(Math.max(options.limit ?? 10, 1), 50),
      page: 1,
    } as ProductsFilterQueryDto;

    const where = {
      ...(await this.buildWhere(query, false)),
      ...(extraWhere ?? {}),
    };

    return this.prisma.product.findMany({
      where,
      take: query.limit,
      orderBy: this.buildOrderBy(query, options.lang ?? DEFAULT_LANGUAGE),
      include: PRODUCT_LIST_INCLUDE,
    });
  }

  private assertDiscountValid(price: number, discountPrice?: number | null) {
    if (discountPrice === null || discountPrice === undefined) return;
    if (discountPrice >= price) {
      throw new BadRequestException(
        'Discount price must be lower than the original price',
      );
    }
  }

  private async assertCategoryUsable(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, is_archived: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    if (category.is_archived) {
      throw new BadRequestException(
        'Cannot assign a product to an archived category',
      );
    }
  }

  private async assertSkuIsFree(sku: string, excludeId?: string) {
    const existing = await this.prisma.product.findFirst({
      where: { sku: { equals: sku, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Product with this SKU already exists');
    }
  }

  private async resolveSlug(source: string, excludeId?: string) {
    return generateUniqueSlug(
      source,
      async (candidate) => {
        const existing = await this.prisma.product.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return !!existing && existing.id !== excludeId;
      },
      'product',
    );
  }
}

interface AttributeColumns {
  key_uz: string;
  key_ru: string;
  key_en: string;
  value_uz: string;
  value_ru: string;
  value_en: string;
  unit_uz: string | null;
  unit_ru: string | null;
  unit_en: string | null;
}

/** DTO dagi `{key: {uz,ru,en}}` ni bazadagi ustunlarga yoyadi. */
function toAttributeColumns(
  attributes: ProductAttributeDto[] | undefined,
): AttributeColumns[] {
  return (attributes ?? []).map((attribute) => ({
    ...spreadLocalizedRequired('key', attribute.key),
    ...spreadLocalizedRequired('value', attribute.value),
    unit_uz: attribute.unit ? pickLocalized(attribute.unit, 'uz') : null,
    unit_ru: attribute.unit ? pickLocalized(attribute.unit, 'ru') : null,
    unit_en: attribute.unit ? pickLocalized(attribute.unit, 'en') : null,
  }));
}

/**
 * Fasetlarni joriy tilda yig'adi.
 *
 * Guruhlash `key_en` / `value_en` bo'yicha ketadi - bu tilga bog'liq bo'lmagan
 * barqaror identifikator. Yorliq (`key`, `value`) esa so'ralgan tilda beriladi,
 * shunda til almashganda filtr tanlovi buzilmaydi.
 */
function aggregateAttributeFacets(
  rows: Array<{ attributes: Partial<AttributeColumns>[] }>,
  lang: Lang,
) {
  interface ValueBucket {
    id: string;
    label: string;
    count: number;
  }

  const byKey = new Map<
    string,
    { label: string; unit: string | null; values: Map<string, ValueBucket> }
  >();

  for (const row of rows) {
    for (const attribute of row.attributes ?? []) {
      const keyId = attribute.key_en || attribute.key_ru || attribute.key_uz;
      const valueId =
        attribute.value_en || attribute.value_ru || attribute.value_uz;
      if (!keyId || !valueId) continue;

      const group = byKey.get(keyId) ?? {
        label:
          pickLocalized(
            {
              uz: attribute.key_uz,
              ru: attribute.key_ru,
              en: attribute.key_en,
            },
            lang,
          ) ?? keyId,
        unit: pickLocalized(
          {
            uz: attribute.unit_uz,
            ru: attribute.unit_ru,
            en: attribute.unit_en,
          },
          lang,
        ),
        values: new Map<string, ValueBucket>(),
      };

      const bucket = group.values.get(valueId) ?? {
        id: valueId,
        label:
          pickLocalized(
            {
              uz: attribute.value_uz,
              ru: attribute.value_ru,
              en: attribute.value_en,
            },
            lang,
          ) ?? valueId,
        count: 0,
      };

      bucket.count += 1;
      group.values.set(valueId, bucket);
      byKey.set(keyId, group);
    }
  }

  return [...byKey.entries()].map(([keyId, group]) => ({
    /** Filtrda ishlatiladigan barqaror kalit: `?attributes=<key>:<value>`. */
    key: keyId,
    label: group.label,
    unit: group.unit,
    values: [...group.values.values()]
      .map((bucket) => ({
        value: bucket.id,
        label: bucket.label,
        count: bucket.count,
      }))
      // Sonli xarakteristikalar (quvvat, napor) son bo'yicha, matnlilar
      // esa ommaboplik bo'yicha saralanadi
      .sort((a, b) => {
        const na = Number(a.value.replace(',', '.'));
        const nb = Number(b.value.replace(',', '.'));
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return b.count - a.count;
      }),
  }));
}

/**
 * SKU ni yagona ko'rinishga keltiradi: chetdagi bo'shliqlar olib tashlanadi va
 * katta harfga o'giriladi. Shu sabab "apl-123" va "APL-123" bitta SKU hisoblanadi.
 */
function normalizeSku(sku?: string | null): string | null {
  const trimmed = (sku ?? '').trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

/** Slug uchun manba: mavjud bo'lgan birinchi til. */
function pickAnyText(value: { uz?: string; ru?: string; en?: string }): string {
  return value.uz?.trim() || value.ru?.trim() || value.en?.trim() || 'product';
}

export interface CollectionOptions {
  limit?: number;
  categoryId?: string;
  categorySlug?: string;
  withinDays?: number;
  lang?: Lang;
  /** `true` bo'lsa faqat admin qo'lda TOP belgilaganlari qaytadi. */
  onlyManual?: boolean;
}
