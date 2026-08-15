import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ToBoolean } from '../../../common/utils/transform.util';

export const CATEGORY_SORT_FIELDS = [
  'sort_order',
  'name',
  'created_at',
  'updated_at',
] as const;

export class CategoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: "Ota kategoriya ID'si bo'yicha filtr (bevosita bolalar).",
  })
  @IsOptional()
  @IsString()
  parent_id?: string;

  @ApiPropertyOptional({
    description: 'Faqat ildiz (parent_id = null) kategoriyalar.',
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  root_only?: boolean;

  @ApiPropertyOptional({
    description: 'Faqat tanlangan (featured) kategoriyalar.',
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  is_featured?: boolean;

  @ApiPropertyOptional({
    description:
      "Arxivlanganlarni ham qo'shish. Faqat ADMIN uchun ishlaydi, aks holda e'tiborsiz qoldiriladi.",
    default: false,
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  include_archived?: boolean;

  @ApiPropertyOptional({
    description: "Har bir kategoriyaga tegishli mahsulotlar sonini qo'shish.",
    default: false,
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  with_product_count?: boolean;

  @ApiPropertyOptional({
    enum: CATEGORY_SORT_FIELDS,
    default: 'sort_order',
    description:
      "Bazadagi maydon nomi. Ro'yxatda yo'q qiymat yuborilsa `sort_order` ishlatiladi.",
  })
  @IsOptional()
  @IsIn(CATEGORY_SORT_FIELDS)
  declare sortBy?: string;
}
