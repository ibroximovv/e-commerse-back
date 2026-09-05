import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
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

  // --- Fiskalizatsiya (O'zbekiston OFD) --------------------------------------
  // IKPU tovar GURUHIGA beriladi, shuning uchun asosiy joyi shu yerda: bitta
  // kategoriyani to'ldirsangiz ichidagi hamma mahsulot shuni oladi. Mahsulotdagi
  // bir nomli maydon faqat istisnolar uchun va bu qiymatni qoplaydi.

  @ApiPropertyOptional({
    example: '08471001001000000',
    description:
      'MXIK / IKPU - soliq organidagi tovar klassifikatori kodi. Payme chekni ' +
      "shu kod bilan fiskallashtiradi. Bo'sh qolsa bu kategoriyadagi " +
      "mahsulotlar uchun to'lov -31008 bilan to'xtaydi (mahsulotning o'zida " +
      "kod bo'lmasa).",
  })
  @IsString()
  @IsOptional()
  ikpu_code?: string;

  @ApiPropertyOptional({
    example: '1501886',
    description: "Qadoqlash kodi. Ixtiyoriy - berilmasa chekka qo'shilmaydi.",
  })
  @IsString()
  @IsOptional()
  package_code?: string;

  @ApiPropertyOptional({
    example: 12,
    description:
      'QQS stavkasi foizda (0 yoki 12). Payme uchun MAJBURIY - 0 ham haqiqiy ' +
      "qiymat (QQS to'lovchisi emassiz), lekin umuman berilmasa to'lov " +
      "-31008 bilan to'xtaydi.",
  })
  @ToNumber()
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  vat_percent?: number;

  @ApiPropertyOptional({
    example: 241092,
    description:
      "O'lchov birligi klassifikatori kodi (dona uchun 241092). Ixtiyoriy - " +
      "berilmasa chekka qo'shilmaydi.",
  })
  @ToNumber()
  @IsInt()
  @Min(0)
  @IsOptional()
  units?: number;
}
