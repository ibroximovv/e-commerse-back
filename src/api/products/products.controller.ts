import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsFilterQueryDto } from './dto/products-filter-query.dto';
import {
  CollectionQueryDto,
  NewArrivalsQueryDto,
  TopProductsQueryDto,
} from './dto/collection-query.dto';
import {
  AdjustStockDto,
  BulkArchiveDto,
  ProductFlagsDto,
} from './dto/admin-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentLang } from '../../common/i18n/request-language';
import type { Lang } from '../../common/i18n/locale';

@ApiTags('Products')
@Controller('api/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ===========================================================================
  // Ochiq (public) endpointlar
  //
  // DIQQAT: statik yo'llar (`top`, `featured` ...) `:id` dan OLDIN turishi shart,
  // aks holda Nest ularni ID sifatida qabul qiladi.
  // ===========================================================================

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Mahsulotlarni qidirish va filtrlash',
    description:
      "Kategoriya, narx oralig'i, brend, teg, atribut, ombor holati, reyting va " +
      "chegirma bo'yicha filtr. Qidiruv uchala tilda bir vaqtda ishlaydi. " +
      '`?with_facets=true` bilan filtr paneli uchun mavjud qiymatlar ham qaytadi. ' +
      "Arxivlangan mahsulotlarni faqat ADMIN ko'ra oladi.",
  })
  findAll(
    @Query() query: ProductsFilterQueryDto,
    @CurrentLang() lang: Lang,
    @CurrentUser('role') role?: Role,
  ) {
    return this.productsService.searchAndFilter(
      query,
      role === Role.ADMIN,
      lang,
    );
  }

  @Get('filters')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Filtr paneli uchun mavjud qiymatlar (fasetlar)',
    description:
      "Narx oralig'i, kategoriyalar, brendlar, atributlar va ularning sonlari. " +
      'Joriy filtrni ham hisobga oladi.',
  })
  getFilterOptions(
    @Query() query: ProductsFilterQueryDto,
    @CurrentLang() lang: Lang,
    @CurrentUser('role') role?: Role,
  ) {
    return this.productsService.getFilterOptions(
      query,
      role === Role.ADMIN,
      lang,
    );
  }

  @Get('top')
  @ApiOperation({
    summary: 'TOP mahsulotlar',
    description:
      "Avval admin qo'lda TOP belgilaganlari, keyin sotuv + reyting + ko'rishlardan " +
      "hosil bo'lgan reyting bali bo'yicha saralanadi.",
  })
  getTop(@Query() query: TopProductsQueryDto, @CurrentLang() lang?: Lang) {
    return this.productsService.getTopProducts({
      limit: query.limit,
      categoryId: query.category_id,
      categorySlug: query.category_slug,
      onlyManual: query.only_manual,
      lang,
    });
  }

  @Get('best-sellers')
  @ApiOperation({ summary: "Eng ko'p sotilgan mahsulotlar" })
  getBestSellers(
    @Query() query: CollectionQueryDto,
    @CurrentLang() lang?: Lang,
  ) {
    return this.productsService.getBestSellers({
      limit: query.limit,
      categoryId: query.category_id,
      categorySlug: query.category_slug,
      lang,
    });
  }

  @Get('featured')
  @ApiOperation({ summary: 'Tanlangan mahsulotlar (bosh sahifa bloki)' })
  getFeatured(@Query() query: CollectionQueryDto, @CurrentLang() lang?: Lang) {
    return this.productsService.getFeaturedProducts({
      limit: query.limit,
      categoryId: query.category_id,
      categorySlug: query.category_slug,
      lang,
    });
  }

  @Get('new-arrivals')
  @ApiOperation({ summary: 'Yangi kelgan mahsulotlar' })
  getNewArrivals(
    @Query() query: NewArrivalsQueryDto,
    @CurrentLang() lang?: Lang,
  ) {
    return this.productsService.getNewArrivals({
      limit: query.limit,
      categoryId: query.category_id,
      categorySlug: query.category_slug,
      withinDays: query.within_days,
      lang,
    });
  }

  @Get('discounted')
  @ApiOperation({ summary: 'Chegirmadagi mahsulotlar (aksiya bloki)' })
  getDiscounted(
    @Query() query: CollectionQueryDto,
    @CurrentLang() lang?: Lang,
  ) {
    return this.productsService.getDiscountedProducts({
      limit: query.limit,
      categoryId: query.category_id,
      categorySlug: query.category_slug,
      lang,
    });
  }

  @Get('top-rated')
  @ApiOperation({ summary: 'Eng yuqori baholangan mahsulotlar' })
  getTopRated(@Query() query: CollectionQueryDto, @CurrentLang() lang?: Lang) {
    return this.productsService.getTopRatedProducts({
      limit: query.limit,
      categoryId: query.category_id,
      categorySlug: query.category_slug,
      lang,
    });
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Mahsulotni slug orqali olish (SEO havolalar uchun)',
  })
  findBySlug(@Param('slug') slug: string, @CurrentUser('role') role?: Role) {
    return this.productsService.findBySlug(slug, role === Role.ADMIN);
  }

  @Get(':id/related')
  @ApiOperation({
    summary: "O'xshash mahsulotlar",
    description:
      "Shu kategoriyaning boshqa mahsulotlari. Katalog tekis bo'lgani uchun " +
      "qardosh kategoriya tushunchasi yo'q.",
  })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  getRelated(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.productsService.getRelatedProducts(id, Number(limit) || 10);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: "Mahsulotni ID bo'yicha olish",
    description:
      "Javobga kategoriya, ombor holati va `is_new` qo'shiladi. " +
      'Mijoz ochganda `view_count` avtomatik oshadi (admin ochganda oshmaydi).',
  })
  findOne(@Param('id') id: string, @CurrentUser('role') role?: Role) {
    return this.productsService.findOneDetailed(id, role === Role.ADMIN);
  }

  // ===========================================================================
  // Admin endpointlari
  // ===========================================================================

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Yangi mahsulot yaratish (Admin)',
    description:
      "Nom, tavsif va har bir xarakteristika `{uz, ru, en}` ko'rinishida " +
      'yuboriladi. Kategoriya mavjudligi va arxivlanmaganligi tekshiriladi, slug ' +
      'avtomatik generatsiya qilinadi, chegirma narxi asosiy narxdan kichikligi ' +
      'validatsiya qilinadi.',
  })
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.createProduct(createProductDto);
  }

  @Patch('bulk/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bir nechta mahsulotni arxivlash/tiklash (Admin)' })
  bulkArchive(@Body() dto: BulkArchiveDto) {
    return this.productsService.bulkArchive(dto.ids, dto.is_archived);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mahsulotni yangilash (Admin)' })
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.updateProduct(id, updateProductDto);
  }

  @Patch(':id/flags')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'TOP / tanlangan / arxiv bayroqlarini almashtirish (Admin)',
  })
  setFlags(@Param('id') id: string, @Body() dto: ProductFlagsDto) {
    return this.productsService.setFlags(id, dto);
  }

  @Patch(':id/stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Ombor zaxirasini o'zgartirish (Admin)" })
  adjustStock(@Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.productsService.adjustStock(id, dto.quantity);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Mahsulotni o'chirish (Admin)",
    description:
      'Buyurtmalar tarixini saqlab qolish uchun odatda `PATCH /:id/flags` orqali ' +
      "arxivlash afzal ko'riladi.",
  })
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
