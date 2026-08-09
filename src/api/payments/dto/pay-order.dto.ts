import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PayOrderDto {
  @ApiProperty({ example: 'order-uuid-here' })
  @IsString()
  @IsNotEmpty()
  order_id: string;

  @ApiProperty({ example: 'click' })
  @IsString()
  @IsNotEmpty()
  provider: string;
}
