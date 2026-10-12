import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { cleanFullName } from '../../../common/utils/phone.util';

export class RegisterDto {
  @ApiProperty({ example: 'Aziza Karimova' })
  @Transform(({ value }) => cleanFullName(value))
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  full_name: string;

  @ApiProperty({
    example: '+998901234567',
    description:
      "Istalgan ko'rinishda: `901234567`, `+998 90 123-45-67`. Server `+998901234567` ga keltiradi.",
  })
  @IsString()
  @IsNotEmpty()
  phone: string;
}
