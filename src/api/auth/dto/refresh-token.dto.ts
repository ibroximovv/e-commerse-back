import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ example: 'refresh_token_string' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}
