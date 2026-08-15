import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ToBoolean, ToNumber } from '../../../common/utils/transform.util';

export const REVIEW_SORT_OPTIONS = [
  'newest',
  'oldest',
  'rating_desc',
  'rating_asc',
] as const;

export class ReviewsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Faqat shu bahodagi izohlar (1..5).' })
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @ApiPropertyOptional({ description: 'Faqat tasdiqlangan xaridlar.' })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  verified_only?: boolean;

  @ApiPropertyOptional({ enum: REVIEW_SORT_OPTIONS, default: 'newest' })
  @IsOptional()
  @IsIn(REVIEW_SORT_OPTIONS)
  sort?: (typeof REVIEW_SORT_OPTIONS)[number];
}
