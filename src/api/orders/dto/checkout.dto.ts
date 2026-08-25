import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CheckoutDto {
  @ApiPropertyOptional({ example: 'Tashkent city, Amir Temur street, 45' })
  @IsOptional()
  @IsString()
  shipping_address?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  customer_phone?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  customer_name?: string;

  @ApiPropertyOptional({ example: 'Please deliver after 6 PM' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: 'CLICK',
    description: 'Payment method: CASH, CLICK, PAYME, STRIPE',
  })
  @IsOptional()
  @IsString()
  payment_method?: string;
}
