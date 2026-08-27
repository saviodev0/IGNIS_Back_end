
import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly prisma: PrismaClient;

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });

    this.prisma = new PrismaClient({ adapter });
  }

  get user(): any {
    return this.prisma.user;
  }

  get studyCycle(): any {
    return this.prisma.studyCycle;
  }

  get achievement(): any {
    return this.prisma.achievement;
  }

  get userAchievement(): any {
    return this.prisma.userAchievement;
  }

  get goal(): any {
  return this.prisma.goal;
}

  get $transaction(): PrismaClient['$transaction'] {
    return this.prisma.$transaction.bind(this.prisma);
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

