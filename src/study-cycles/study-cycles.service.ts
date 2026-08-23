import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

async complete(cycleId: number, userId: string) {
  const cycle = await this.prisma.studyCycle.findFirst({
    where: {
      id: cycleId,
      userId,
    },
  });

  if (!cycle) {
    throw new NotFoundException('Ciclo não encontrado');
  }

  if (cycle.completed) {
    throw new ConflictException('Este ciclo já foi concluído');
  }

  const ignisEarned = cycle.durationMinutes;

  const result = await this.prisma.$transaction(async (tx) => {
    const completedCycle = await tx.studyCycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        completed: true,
        completedAt: new Date(),
        ignisEarned,
      },
    });

    const updatedUser = await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        ignisPoints: {
          increment: ignisEarned,
        },
      },
      select: {
        id: true,
        name: true,
        ignisPoints: true,
      },
    });

    return {
      cycle: completedCycle,
      user: updatedUser,
    };
  });

  return result;
}
}