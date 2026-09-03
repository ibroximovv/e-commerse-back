import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ToBoolean, ToNumber } from '../../../common/utils/transform.util';
import {
  HasAtLeastOneLanguage,
  LocalizedTextDto,
} from '../../../common/dto/localized-text.dto';

export class CreateCategoryDto {
  @ApiProperty({
    type: LocalizedTextDto,
    description:
      "Kategoriya nomi. Kamida bitta til to'ldirilishi shart; qolganlari " +
      "bo'sh qolsa mavjud tildan nusxalanadi.",
    example: {
      uz: 'Avtomatik nasoslar',
      ru: 'Автоматические насосы',
      en: 'Automatic pumps',
    },
  })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @HasAtLeastOneLanguage()
  name: LocalizedTextDto;

  @ApiPropertyOptional({
    type: LocalizedTextDto,
    description: 'Kategoriya tavsifi (ixtiyoriy, har bir til alohida).',
  })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  description?: LocalizedTextDto;

  @ApiPropertyOptional({
    example: 'avtomaticheskie-nasosy',
    description:
      "Bo'sh qoldirilsa nomdan avtomatik generatsiya qilinadi (kirill ham " +
      "qo'llab-quvvatlanadi). Slug barcha tillar uchun yagona.",
  })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug faqat kichik lotin harflari, raqam va defisdan iborat',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'uploads/category.png' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({ example: 'uploads/icons/pump.svg' })
  @IsString()
  @IsOptional()
  icon?: string;

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
