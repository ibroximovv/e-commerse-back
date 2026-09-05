import { Controller, Get, Param, UseGuards, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
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

  @Get('checkout/:order_id')
  @ApiParam({ name: 'order_id', example: 'order-uuid-here' })
  @ApiOperation({
    summary: 'Buyurtma uchun Payme kassasiga havola olish',
    description:
      "To'lovni YAKUNLAMAYDI - faqat havola qaytaradi. Mijoz kassada to'lovni " +
      'tasdiqlagach, Payme `POST /api/payments/payme` ga murojaat qiladi va ' +
      "buyurtma o'sha yerda CONFIRMED bo'ladi. Kassa oynasining tili " +
      "xaridorning profilidan olinadi, so'rovda til yubormaysiz.",
  })
  createCheckout(
    @CurrentUser('sub') userId: string,
    @Param('order_id') orderId: string,
  ) {
    return this.paymentsService.createCheckout(userId, orderId);
  }

  @Get('admin/all')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      "Barcha to'lov tranzaksiyalari (Admin). Qidiruv Payme tranzaksiya ID'si, " +
      "buyurtma ID va provayder bo'yicha ishlaydi.",
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
