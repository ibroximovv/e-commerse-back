import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { PayOrderDto } from './dto/pay-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Pay for a pending order' })
  payOrder(@CurrentUser('sub') userId: string, @Body() dto: PayOrderDto) {
    return this.paymentsService.payOrder(userId, dto.order_id, dto.provider);
  }

  @Get('status/:order_id')
  @ApiOperation({ summary: 'Get payment status of an order' })
  getPaymentStatus(
    @Param('order_id') orderId: string,
    @CurrentUser() currentUser: any,
  ) {
    const isAdmin = currentUser.role === 'ADMIN';
    return this.paymentsService.getPaymentStatus(
      orderId,
      currentUser.sub,
      isAdmin,
    );
  }
}
