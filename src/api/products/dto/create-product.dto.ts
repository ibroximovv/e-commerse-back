import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ToBoolean,
  ToNumber,
  ToStringArray,
} from '../../../common/utils/transform.util';
import {
  HasAtLeastOneLanguage,
  LocalizedTextDto,
} from '../../../common/dto/localized-text.dto';

export class ProductAttributeDto {
  @ApiProperty({
    type: LocalizedTextDto,
    description:
      "Xarakteristika nomi. Birlikni kalitga qo'shmang (`Мощность`, `Мощность,W` emas) - " +
      "aks holda bitta spetsifikatsiya bir nechta faset guruhiga bo'linib ketadi.",
    example: { uz: 'Quvvat', ru: 'Мощность', en: 'Power' },
  })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @HasAtLeastOneLanguage()
  key: LocalizedTextDto;

  @ApiProperty({
    type: LocalizedTextDto,
    description:
      'Qiymat. Sonli qiymatlar uchala tilda bir xil yoziladi (`250`), matnli ' +
      'qiymatlar esa tarjima qilinadi (`Медный` / `Mis` / `Copper`).',
    example: { uz: '250', ru: '250', en: '250' },
  })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @HasAtLeastOneLanguage()
  value: LocalizedTextDto;

  @ApiPropertyOptional({
    type: LocalizedTextDto,
    description:
      "O'lchov birligi. Qiymatdan ajratib saqlanadi, shunda fasetlarda " +
      '"Quvvat" bitta guruh bo\'lib qoladi va son bo\'yicha saralash mumkin.',
    example: { uz: 'Vt', ru: 'Вт', en: 'W' },
  })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  unit?: LocalizedTextDto;
}

export class CreateProductDto {
  @ApiProperty({
    type: LocalizedTextDto,
    description:
      "Mahsulot nomi. Kamida bitta til shart; qolganlari bo'sh qolsa mavjud " +
      'tildan nusxalanadi.',
    example: {
      uz: 'Avtomatik suv nasosi 1WZB-250 (alyuminiy)',
      ru: 'Автоматический водяной насос 1WZB-250 (алюминий)',
      en: 'Automatic water pump 1WZB-250 (aluminium)',
    },
  })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @HasAtLeastOneLanguage()
  name: LocalizedTextDto;

  @ApiPropertyOptional({
    example: 'avtomaticheskiy-vodyanoy-nasos-1wzb-250',
    description: "Bo'sh qoldirilsa nomdan avtomatik generatsiya qilinadi.",
  })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug faqat kichik lotin harflari, raqam va defisdan iborat',
  })
  slug?: string;

  @ApiPropertyOptional({
    example: '1WZB-250',
    description: 'Ombor kodi / katalog modeli (unikal)',
  })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  @IsOptional()
  description?: LocalizedTextDto;

  @ApiPropertyOptional({ example: 'OCO' })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional({
    example: ['1wzb', 'nasos', 'avtomatik'],
    description: 'Qidiruv va filtr uchun teglar.',
  })
  @ToStringArray()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    example: 999.99,
    description:
      "Asosiy (chegirmasiz) narx. `price_on_request: true` bo'lsa yuborilmasligi mumkin - 0 bo'lib saqlanadi.",
  })
  @ValidateIf((dto: CreateProductDto) => dto.price_on_request !== true)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    default: false,
    description:
      "Narx kelishilgan holda beriladi (katalogda narx ko'rsatilmagan tovarlar). " +
      "true bo'lsa narx 0 saqlanadi, chegirma o'chiriladi va mahsulot savatga/buyurtmaga tushmaydi.",
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  price_on_request?: boolean;

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

  @ApiPropertyOptional({ example: ['uploads/1wzb-250.png'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[] = [];

  @ApiProperty({ example: 'category-uuid-here' })
  @IsString()
  @IsNotEmpty()
  category_id: string;

  @ApiPropertyOptional({
    type: [ProductAttributeDto],
    description:
      'Katalogdagi barcha xarakteristikalar shu yerga kiritiladi: quvvat, ' +
      "maksimal napor, o'tkazish qobiliyati, aylanish chastotasi, so'rish " +
      'balandligi, teshik diametri, himoya klassi, kuchlanish, chastota, ' +
      "amperaj, og'irlik, membrana, bosim, harorat va h.k.",
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeDto)
  @IsOptional()
  attributes?: ProductAttributeDto[] = [];

  // --- Fiskalizatsiya (Payme cheki) -----------------------------------------

  @ApiPropertyOptional({
    example: '08471001001000000',
    description:
      'MXIK / IKPU - soliq organidagi tovar klassifikatori kodi. Payme ' +
      "chekni shu kod bilan fiskallashtiradi. Bo'sh qolsa `.env` dagi " +
      '`PAYME_DEFAULT_IKPU_CODE` ishlatiladi.',
  })
  @IsString()
  @IsOptional()
  ikpu_code?: string;

  @ApiPropertyOptional({
    example: '1501886',
    description: "Qadoqlash kodi. Bo'sh qolsa `PAYME_DEFAULT_PACKAGE_CODE`.",
  })
  @IsString()
  @IsOptional()
  package_code?: string;

  @ApiPropertyOptional({
    example: 12,
    description:
      "QQS stavkasi foizda (0 yoki 12). Bo'sh qolsa `.env` dagi qiymat.",
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
      "O'lchov birligi klassifikatori kodi (dona uchun 241092). " +
      "Bo'sh qolsa `PAYME_DEFAULT_UNITS`.",
  })
  @ToNumber()
  @IsInt()
  @Min(0)
  @IsOptional()
  units?: number;

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
