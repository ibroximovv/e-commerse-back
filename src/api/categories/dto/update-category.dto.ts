import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';
import { ToBoolean } from '../../../common/utils/transform.util';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional({
    example: false,
    description:
      'Arxivlanganda barcha ichki kategoriyalar va ularning mahsulotlari ham arxivlanadi.',
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  is_archived?: boolean;
}
