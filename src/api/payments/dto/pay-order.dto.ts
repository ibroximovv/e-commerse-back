import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_LANGUAGES } from '../../../common/i18n/locale';

/**
 * Kassaga havola so'rovi.
 *
 * `provider` maydoni ATAYLAB yo'q: ulangan yagona provayder - Payme, va
 * servis baribir har doim Payme havolasini quradi. Maydonni saqlab qolish
 * mijozga tanlov bordek ko'rinardi, aslida qiymati e'tiborsiz qolardi.
 * Ikkinchi provayder (Click) ulanganda uni qaytadan qo'shish - qo'shimcha
 * ixtiyoriy maydon, ya'ni buzuvchi o'zgarish emas. Javobda `provider`
 * qaytadi, shuning uchun mijoz qaysi kassaga yuborilayotganini biladi.
 */
export class CreateCheckoutDto {
  @ApiProperty({ example: 'order-uuid-here' })
  @IsString()
  @IsNotEmpty()
  order_id: string;

  @ApiPropertyOptional({
    enum: SUPPORTED_LANGUAGES,
    description:
      "Payme kassasi oynasining tili. Bo'sh bo'lsa `?ln` ishlatiladi.",
  })
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  lang?: (typeof SUPPORTED_LANGUAGES)[number];
}
