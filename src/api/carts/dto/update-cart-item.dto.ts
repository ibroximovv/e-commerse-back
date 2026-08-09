import { IsNotEmpty, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCartItemDto {
  @ApiProperty({ example: 2 })
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  quantity: number;
}
