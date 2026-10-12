import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Faqat Swagger hujjati uchun: `/login` ni `PhoneStrategy` (Passport) tekshiradi,
 * guard esa ValidationPipe dan OLDIN ishlaydi.
 */
export class LoginDto {
  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({
    example: 'Aziza Karimova',
    description:
      "Oddiy foydalanuvchi uchun majburiy. Registr va ortiqcha bo'shliqlar hisobga olinmaydi.",
  })
  @IsString()
  @IsOptional()
  full_name?: string;

  @ApiPropertyOptional({
    example: 'StrongAdminPass1',
    description: 'Faqat ADMIN uchun majburiy (admin panel).',
  })
  @IsString()
  @IsOptional()
  password?: string;
}
