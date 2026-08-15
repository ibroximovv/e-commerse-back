import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ToBoolean, ToNumber } from '../../../common/utils/transform.util';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Electronics' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'electronics',
    description:
      "Bo'sh qoldirilsa `name` dan avtomatik generatsiya qilinadi (kirill ham qo'llab-quvvatlanadi).",
  })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug faqat kichik lotin harflari, raqam va defisdan iborat',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'Smartphones, gadgets and computers' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'uploads/category.png' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({ example: 'uploads/icons/electronics.svg' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({
    example: null,
    description:
      "Ota kategoriya ID'si. Bo'sh bo'lsa - ildiz (root) kategoriya bo'ladi.",
  })
  @IsString()
  @IsOptional()
  parent_id?: string;

  @ApiPropertyOptional({ default: false })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  is_featured?: boolean;

  @ApiPropertyOptional({
    default: 0,
    description: 'Menyudagi tartib. Kichik son - yuqorida turadi.',
  })
  @ToNumber()
  @IsInt()
  @Min(0)
  @IsOptional()
  sort_order?: number;
}
