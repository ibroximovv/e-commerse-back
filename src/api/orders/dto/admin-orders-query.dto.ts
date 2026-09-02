import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { OrderStatus } from '@prisma/client';
import { ToNumber } from '../../../common/utils/transform.util';

export class AdminOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: OrderStatus,
    description: 'Filter orders by status',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    description: 'Start date filter (ISO format)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({
    description: 'End date filter (ISO format)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ description: 'Minimum total amount' })
  @ToNumber()
  @IsNumber()
  @Min(0)
  @IsOptional()
  min_amount?: number;

  @ApiPropertyOptional({ description: 'Maximum total amount' })
  @ToNumber()
  @IsNumber()
  @Min(0)
  @IsOptional()
  max_amount?: number;
}
