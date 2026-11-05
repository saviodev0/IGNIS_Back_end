import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    try {
      await this.prisma.isHealthy();
      return {
        status: 'ok',
        service: 'Ignis API',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'Ignis API',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  }

  getHello(): string {
    return 'Hello World!';
  }
}
