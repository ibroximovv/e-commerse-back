import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('System & Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'API Root & Health Check' })
  getRoot() {
    return this.appService.getHealth();
  }

  @Get('api/health')
  @ApiOperation({ summary: 'Service Health Status' })
  getHealth() {
    return this.appService.getHealth();
  }
}
