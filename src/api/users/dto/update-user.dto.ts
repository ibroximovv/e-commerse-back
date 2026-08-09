import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  @IsOptional()
  full_name?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'uploads/photo.jpg' })
  @IsString()
  @IsOptional()
  photo?: string;

  @ApiPropertyOptional({ example: 'uz', enum: ['uz', 'ru', 'en'] })
  @IsString()
  @IsOptional()
  @IsIn(['uz', 'ru', 'en'])
  language?: string;
}
