import { IsOptional, IsString, IsIn, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Aziza Karimova' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  full_name?: string;

  @ApiPropertyOptional({
    example: '+998901234567',
    description: "Login kaliti. Boshqa foydalanuvchida bo'lsa 409.",
  })
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
