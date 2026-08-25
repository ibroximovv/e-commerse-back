import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { Role } from '@prisma/client';

export class UsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Role, description: 'Filter users by role' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
