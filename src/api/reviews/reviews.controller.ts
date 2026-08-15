import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsQueryDto } from './dto/reviews-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Reviews')
@Controller('api')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('products/:productId/reviews')
  @ApiOperation({
    summary: 'Mahsulot izohlari va reyting taqsimoti',
    description:
      "`meta.summary` ichida o'rtacha baho va yulduzlar bo'yicha taqsimot qaytadi.",
  })
  findByProduct(
    @Param('productId') productId: string,
    @Query() query: ReviewsQueryDto,
  ) {
    return this.reviewsService.findByProduct(productId, query);
  }

  @Get('products/:productId/reviews/summary')
  @ApiOperation({ summary: 'Faqat reyting xulosasi (izohlarsiz)' })
  getSummary(@Param('productId') productId: string) {
    return this.reviewsService.getRatingSummary(productId);
  }

  @Post('products/:productId/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Baho qoldirish yoki yangilash',
    description:
      'Bir foydalanuvchi bir mahsulotga bitta baho qoldiradi; qayta yuborilsa yangilanadi. ' +
      "Foydalanuvchi shu mahsulotni sotib olgan bo'lsa `is_verified_purchase` avtomatik `true` bo'ladi.",
  })
  create(
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reviewsService.upsertReview(productId, userId, dto);
  }

  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Izohni o'chirish (muallif yoki admin)" })
  remove(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.reviewsService.removeReview(id, userId, role);
  }
}
