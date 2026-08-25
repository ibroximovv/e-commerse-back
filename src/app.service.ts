import { Injectable } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    let dbStatus = 'connected';
    try {
      // Check MongoDB connection by performing a lightweight count
      await this.prisma.user.count({ take: 1 });
    } catch (e: any) {
      dbStatus = `error: ${e.message || 'connection failed'}`;
    }

    return {
      status: 'ok',
      service: 'E-commerce REST API',
      version: '1.0.0',
      database: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
