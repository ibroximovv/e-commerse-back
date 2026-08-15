import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ToBoolean, ToNumber } from '../../../common/utils/transform.util';

export class ProductFlagsDto {
  @ApiPropertyOptional({ description: "TOP mahsulot bayrog'i." })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  is_top?: boolean;

  @ApiPropertyOptional({ description: "'Tanlangan mahsulotlar' bayrog'i." })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  is_featured?: boolean;

  @ApiPropertyOptional({ description: 'Arxiv holati.' })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  is_archived?: boolean;
}

export class AdjustStockDto {
  @ApiProperty({
    example: 25,
    description:
      "Zaxiraga qo'shiladigan miqdor. Manfiy son ayiradi. Natija 0 dan kichik bo'lsa xato qaytadi.",
  })
  @ToNumber()
  @IsInt()
  quantity: number;
}

export class BulkArchiveDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ example: true })
  @ToBoolean()
  @IsBoolean()
  is_archived: boolean;
}
