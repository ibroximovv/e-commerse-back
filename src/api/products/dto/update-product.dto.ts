import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { ToBoolean } from '../../../common/utils/transform.util';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({ example: false })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  is_archived?: boolean;
}
