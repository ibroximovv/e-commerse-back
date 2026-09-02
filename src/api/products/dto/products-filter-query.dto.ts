import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  ToBoolean,
  ToNumber,
  ToStringArray,
} from '../../../common/utils/transform.util';

/**
 * Frontend uchun tayyor sortlash presetlari. Har biri ichkarida
 * xavfsiz `orderBy` ga aylantiriladi - foydalanuvchi baza maydon nomini bilishi shart emas.
 */
export const PRODUCT_SORT_OPTIONS = [
  'relevance', // default: TOP -> reyting -> sotuv
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'popular', // eng ko'p sotilgan
  'top_rated', // eng yuqori reyting
  'most_viewed',
  'discount', // eng katta chegirma
  'name_asc',
  'name_desc',
] as const;

export type ProductSortOption = (typeof PRODUCT_SORT_OPTIONS)[number];

export const PRODUCT_STOCK_STATUS = [
  'in_stock',
  'out_of_stock',
  'low_stock',
] as const;

export class ProductsFilterQueryDto extends PaginationQueryDto {
  // --- Kategoriya -----------------------------------------------------------

  @ApiPropertyOptional({ description: "Bitta kategoriya ID'si." })
  @IsOptional()
  @IsString()
  category_id?: string;

  @ApiPropertyOptional({
    description:
      'Bir nechta kategoriya: `?category_ids=id1,id2` yoki takrorlanuvchi param.',
    type: [String],
  })
  @ToStringArray()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  category_ids?: string[];

  @ApiPropertyOptional({
    description:
      "Kategoriya slug'i orqali filtr (`category_id` o'rniga ishlatiladi).",
    example: 'smartfonlar',
  })
  @IsOptional()
  @IsString()
  category_slug?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'Ota kategoriya tanlanganda ichki kategoriyalardagi mahsulotlar ham chiqadi.',
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  include_descendants?: boolean = true;

  // --- Narx -----------------------------------------------------------------

  @ApiPropertyOptional({
    description:
      "Minimal narx. Chegirma hisobga olingan yakuniy narx bo'yicha filtrlaydi.",
  })
  @ToNumber()
  @IsNumber()
  @Min(0)
  @IsOptional()
  min_price?: number;

  @ApiPropertyOptional({ description: 'Maksimal narx (yakuniy narx).' })
  @ToNumber()
  @IsNumber()
  @Min(0)
  @IsOptional()
  max_price?: number;

  @ApiPropertyOptional({
    description:
      "Narxi bo'yicha filtr: `false` - faqat narxi bor tovarlar, `true` - faqat " +
      '"narx kelishilgan holda" tovarlar. Yuborilmasa ikkalasi ham chiqadi.',
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  price_on_request?: boolean;

  @ApiPropertyOptional({ description: 'Faqat chegirmadagi mahsulotlar.' })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  has_discount?: boolean;

  @ApiPropertyOptional({ description: 'Minimal chegirma foizi, masalan 20.' })
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  min_discount_percent?: number;

  // --- Atributlar / brend / teg --------------------------------------------

  @ApiPropertyOptional({
    description: 'Brendlar: `?brands=Apple,Samsung`.',
    type: [String],
  })
  @ToStringArray()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  brands?: string[];

  @ApiPropertyOptional({
    description: 'Teglar: `?tags=5g,gaming`. Kamida bittasi mos kelsa yetarli.',
    type: [String],
  })
  @ToStringArray()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    description:
      "Atribut filtri `kalit:qiymat` ko'rinishida: `?attributes=Color:Black,Storage:256GB`. " +
      'Har bir juftlik AND, bitta kalitning bir nechta qiymati OR sifatida ishlaydi.',
    type: [String],
    example: ['Color:Black', 'Storage:256GB'],
  })
  @ToStringArray()
  @IsArray()
  @Matches(/^[^:]+:[^:]+$/, {
    each: true,
    message: "attributes elementi `kalit:qiymat` ko'rinishida bo'lishi kerak",
  })
  @IsOptional()
  attributes?: string[];

  // --- Holat ----------------------------------------------------------------

  @ApiPropertyOptional({ enum: PRODUCT_STOCK_STATUS })
  @IsOptional()
  @IsIn(PRODUCT_STOCK_STATUS)
  stock_status?: (typeof PRODUCT_STOCK_STATUS)[number];

  @ApiPropertyOptional({
    description: 'Faqat omborda bori (`stock_status=in_stock` bilan bir xil).',
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  in_stock?: boolean;

  @ApiPropertyOptional({ description: 'Minimal reyting, 1..5.' })
  @ToNumber()
  @IsNumber()
  @Min(0)
  @Max(5)
  @IsOptional()
  min_rating?: number;

  @ApiPropertyOptional({
    description: 'Faqat TOP deb belgilangan mahsulotlar.',
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  is_top?: boolean;

  @ApiPropertyOptional({ description: "Faqat 'tanlangan' mahsulotlar." })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  is_featured?: boolean;

  @ApiPropertyOptional({
    description: "Oxirgi N kun ichida qo'shilganlar (yangi kelganlar).",
    example: 30,
  })
  @ToNumber()
  @IsInt()
  @Min(1)
  @IsOptional()
  new_within_days?: number;

  // --- Sortlash / ko'rinish -------------------------------------------------

  @ApiPropertyOptional({ enum: PRODUCT_SORT_OPTIONS, default: 'relevance' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_OPTIONS)
  sort?: ProductSortOption;

  @ApiPropertyOptional({
    description:
      "Javobga filtr panelini qurish uchun fasetlar (brendlar, narx oralig'i, atributlar) qo'shiladi.",
    default: false,
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  with_facets?: boolean;

  @ApiPropertyOptional({
    description:
      "Arxivlangan mahsulotlarni ham ko'rsatish. Faqat ADMIN uchun, aks holda e'tiborsiz qoldiriladi.",
    default: false,
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  include_archived?: boolean;

  /** @deprecated `include_archived` ishlating. Eski frontend bilan moslik uchun qoldirilgan. */
  @ApiPropertyOptional({ deprecated: true })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  all?: boolean;
}
