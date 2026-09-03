import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymeService } from './payme/payme.service';
import { PaymeController } from './payme/payme.controller';

@Module({
  // PaymeController Payme serveri uchun ochiq webhook - JWT guard'siz,
  // avtorizatsiya `Basic` kaliti orqali PaymeService ichida tekshiriladi.
  controllers: [PaymentsController, PaymeController],
  providers: [PaymentsService, PaymeService],
  exports: [PaymeService],
})
export class PaymentsModule {}
