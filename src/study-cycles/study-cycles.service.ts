import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StudyCyclesService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, durationMinutes: number) {
  return this.prisma.studyCycle.create({
    data: {
      userId,
      durationMinutes,
      startedAt: new Date(),
    },
  });
}
}