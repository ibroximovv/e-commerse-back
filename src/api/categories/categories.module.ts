import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  // ProductsService kategoriya daraxti bilan ishlaydi (avlod ID'lari, breadcrumbs)
  exports: [CategoriesService],
})
export class CategoriesModule {}
