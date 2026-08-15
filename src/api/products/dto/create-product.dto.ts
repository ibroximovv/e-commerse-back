import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ToBoolean, ToStringArray } from '../../../common/utils/transform.util';

export class ProductAttributeDto {
  @ApiProperty({ example: 'Color' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'Black' })
  @IsString()
  @IsNotEmpty()
  value: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'iPhone 15 Pro' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'iphone-15-pro',
    description: "Bo'sh qoldirilsa `name` dan avtomatik generatsiya qilinadi.",
  })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug faqat kichik lotin harflari, raqam va defisdan iborat',
  })
  slug?: string;

  @ApiPropertyOptional({
    example: 'APL-IP15P-256-BLK',
    description: 'Ombor kodi (unikal)',
  })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ example: 'Latest Apple iPhone' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Apple' })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional({
    example: ['smartphone', 'apple', '5g'],
    description: 'Qidiruv va filtr uchun teglar.',
  })
  @ToStringArray()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiProperty({ example: 999.99, description: 'Asosiy (chegirmasiz) narx' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    example: 849.99,
    description:
      "Aksiya narxi. `price` dan kichik bo'lishi shart. Chegirmani bekor qilish uchun `null` yuboring.",
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  discount_price?: number | null;

  @ApiPropertyOptional({ example: 50 })
  @IsInt()
  @IsOptional()
  @Min(0)
  stock?: number = 0;

  @ApiPropertyOptional({ example: ['uploads/iphone.png'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[] = [];

  @ApiProperty({ example: 'category-uuid-here' })
  @IsString()
  @IsNotEmpty()
  category_id: string;

  @ApiPropertyOptional({ type: [ProductAttributeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeDto)
  @IsOptional()
  attributes?: ProductAttributeDto[] = [];

  @ApiPropertyOptional({
    default: false,
    description: "Admin qo'lda belgilaydigan TOP mahsulot bayrog'i.",
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  is_top?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: "Bosh sahifadagi 'Tanlangan mahsulotlar' bloki uchun.",
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  is_featured?: boolean;
}
