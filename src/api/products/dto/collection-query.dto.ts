import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ToBoolean, ToNumber } from '../../../common/utils/transform.util';

/**
 * Bosh sahifadagi bloklar (TOP, yangi kelganlar, aksiya ...) uchun yengil query.
 * To'liq filtr kerak bo'lsa `GET /api/products` ishlatiladi.
 */
export class CollectionQueryDto {
  @ApiPropertyOptional({ default: 10, maximum: 50 })
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Blokni bitta kategoriya bilan cheklash.',
  })
  @IsOptional()
  @IsString()
  category_id?: string;

  @ApiPropertyOptional({ description: "Kategoriya slug'i orqali cheklash." })
  @IsOptional()
  @IsString()
  category_slug?: string;
}

export class TopProductsQueryDto extends CollectionQueryDto {
  @ApiPropertyOptional({
    default: false,
    description:
      "true - faqat admin qo'lda `is_top` qilib belgilaganlari; false - avtomatik reyting bali bo'yicha.",
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  only_manual?: boolean;
}

export class NewArrivalsQueryDto extends CollectionQueryDto {
  @ApiPropertyOptional({
    default: 30,
    description: "Necha kun ichida qo'shilganlar hisobga olinsin.",
  })
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  within_days?: number = 30;
}
