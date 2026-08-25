import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { PayOrderDto } from './dto/pay-order.dto';
import { PaymentsQueryDto } from './dto/payments-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Pay for a pending order' })
  payOrder(@CurrentUser('sub') userId: string, @Body() dto: PayOrderDto) {
    return this.paymentsService.payOrder(userId, dto.order_id, dto.provider);
  }

  @Get('admin/all')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get all payment transactions with pagination & filters (Admin only)',
  })
  findAllAdmin(@Query() query: PaymentsQueryDto) {
    return this.paymentsService.findAllAdmin(query);
  }

  @Get('status/:order_id')
  @ApiOperation({ summary: 'Get payment status of an order' })
  getPaymentStatus(
    @Param('order_id') orderId: string,
    @CurrentUser() currentUser: any,
  ) {
    const isAdmin = currentUser.role === Role.ADMIN;
    return this.paymentsService.getPaymentStatus(
      orderId,
      currentUser.sub,
      isAdmin,
    );
  }
}
