import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaymentStatus } from '@prisma/client';

export class PaymentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus, description: 'Filter by payment status' })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ description: 'Filter by provider (e.g. CLICK, PAYME, STRIPE)' })
  @IsOptional()
  @IsString()
  provider?: string;
}
