import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ToNumber } from '../../../common/utils/transform.util';

export class CreateReviewDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @ToNumber()
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    example: 'Juda sifatli mahsulot, tez yetkazib berishdi.',
  })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  comment?: string;
}
