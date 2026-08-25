import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './common/services/mail.module';
import { AuthModule } from './api/auth/auth.module';
import { UsersModule } from './api/users/users.module';
import { CategoriesModule } from './api/categories/categories.module';
import { ProductsModule } from './api/products/products.module';
import { ReviewsModule } from './api/reviews/reviews.module';
import { CartsModule } from './api/carts/carts.module';
import { OrdersModule } from './api/orders/orders.module';
import { PaymentsModule } from './api/payments/payments.module';
import { UploadModule } from './api/upload/upload.module';
import { DashboardModule } from './api/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    MailModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    ReviewsModule,
    CartsModule,
    OrdersModule,
    PaymentsModule,
    UploadModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
