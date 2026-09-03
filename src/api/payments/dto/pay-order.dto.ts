import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_LANGUAGES } from '../../../common/i18n/locale';

/** Hozircha yagona ulangan provayder. Yangisi qo'shilsa shu ro'yxat kengayadi. */
export const PAYMENT_PROVIDERS = ['payme'] as const;

export class CreateCheckoutDto {
  @ApiProperty({ example: 'order-uuid-here' })
  @IsString()
  @IsNotEmpty()
  order_id: string;

  @ApiPropertyOptional({
    enum: PAYMENT_PROVIDERS,
    default: 'payme',
    description: "To'lov provayderi.",
  })
  @IsOptional()
  @IsIn(PAYMENT_PROVIDERS)
  provider?: (typeof PAYMENT_PROVIDERS)[number] = 'payme';

  @ApiPropertyOptional({
    enum: SUPPORTED_LANGUAGES,
    description:
      "Payme kassasi oynasining tili. Bo'sh bo'lsa `?ln` ishlatiladi.",
  })
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  lang?: (typeof SUPPORTED_LANGUAGES)[number];
}
