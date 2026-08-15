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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoriesQueryDto } from './dto/categories-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Categories')
@Controller('api/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ===========================================================================
  // Ochiq (public) endpointlar - statik yo'llar `:id` dan oldin
  // ===========================================================================

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: "Kategoriyalar ro'yxati (sahifalangan)",
    description:
      "`root_only`, `parent_id`, `is_featured`, `search` bo'yicha filtr. " +
      "`with_product_count=true` bilan har biriga mahsulotlar soni qo'shiladi. " +
      "Arxivlanganlarni faqat ADMIN `include_archived=true` bilan ko'ra oladi.",
  })
  findAll(
    @Query() query: CategoriesQueryDto,
    @CurrentUser('role') role?: Role,
  ) {
    return this.categoriesService.search(query, role === Role.ADMIN);
  }

  @Get('tree')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Kategoriyalar daraxti (menyu uchun)',
    description:
      "Butun ierarxiyani bitta so'rovda qaytaradi. `with_product_count=true` bo'lsa " +
      "ota kategoriya soni ichki kategoriyalarnikini ham o'z ichiga oladi.",
  })
  @ApiQuery({ name: 'with_product_count', required: false, type: Boolean })
  @ApiQuery({ name: 'include_archived', required: false, type: Boolean })
  @ApiQuery({
    name: 'root_id',
    required: false,
    description: 'Berilsa - faqat shu kategoriyaning quyi daraxti qaytadi.',
  })
  getTree(
    @Query('with_product_count') withProductCount?: string,
    @Query('include_archived') includeArchived?: string,
    @Query('root_id') rootId?: string,
    @CurrentUser('role') role?: Role,
  ) {
    return this.categoriesService.getTree({
      isAdmin: role === Role.ADMIN,
      includeArchived: parseFlag(includeArchived),
      withProductCount: parseFlag(withProductCount),
      rootId,
    });
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Kategoriyani slug orqali olish (SEO havolalar uchun)',
  })
  findBySlug(@Param('slug') slug: string, @CurrentUser('role') role?: Role) {
    return this.categoriesService.findBySlug(slug, role === Role.ADMIN);
  }

  @Get(':id/breadcrumbs')
  @ApiOperation({
    summary: 'Kategoriya zanjiri (Elektronika / Telefonlar / ...)',
  })
  getBreadcrumbs(@Param('id') id: string) {
    return this.categoriesService.getBreadcrumbs(id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: "Kategoriyani ID bo'yicha olish",
    description:
      "Javobga ichki kategoriyalar, breadcrumbs va mahsulotlar soni qo'shiladi. " +
      'Mahsulotlarni olish uchun: `GET /api/products?category_id=<id>`.',
  })
  findOne(@Param('id') id: string, @CurrentUser('role') role?: Role) {
    return this.categoriesService.findOneDetailed(id, role === Role.ADMIN);
  }

  // ===========================================================================
  // Admin endpointlari
  // ===========================================================================

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Yangi kategoriya yaratish (Admin)',
    description:
      "`parent_id` berilsa ichki kategoriya bo'ladi. Slug avtomatik generatsiya qilinadi.",
  })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.createCategory(createCategoryDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Kategoriyani yangilash (Admin)',
    description:
      "Kategoriyani o'z ichki kategoriyasi ostiga ko'chirish bloklanadi (sikl). " +
      "`is_archived` o'zgartirilsa - butun quyi daraxt va undagi mahsulotlar ham o'zgaradi.",
  })
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.updateCategory(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Kategoriyani o'chirish (Admin)",
    description:
      "Ichki kategoriyasi yoki mahsuloti bor kategoriya o'chirilmaydi - arxivlash kerak.",
  })
  remove(@Param('id') id: string) {
    return this.categoriesService.removeCategory(id);
  }
}

/** Query'dagi `?x=true` / `?x=1` ni boolean ga o'giradi. */
function parseFlag(value?: string): boolean {
  return ['true', '1', 'yes', 'on'].includes((value ?? '').toLowerCase());
}
