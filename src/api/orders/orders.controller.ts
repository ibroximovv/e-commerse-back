import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Checkout current user cart and place an order' })
  checkout(@CurrentUser('sub') userId: string) {
    return this.ordersService.checkout(userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get current user orders' })
  @ApiQuery({ name: 'archived', required: false, type: Boolean, description: 'Filter archived orders' })
  findUserOrders(
    @CurrentUser('sub') userId: string,
    @Query('archived') archived?: string,
  ) {
    const isArchived = archived === 'true';
    return this.ordersService.findUserOrders(userId, isArchived);
  }

  @Get('admin/all')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all orders in system (Admin only)' })
  findAllAdmin() {
    return this.ordersService.findAllAdmin();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    const isAdmin = currentUser.role === Role.ADMIN;
    return this.ordersService.findOne(id, currentUser.sub, isAdmin);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive/Hide past order history' })
  archiveOrder(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.ordersService.archiveOrder(id, userId);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update order status (Admin only)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto.status);
  }
}
