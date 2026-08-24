
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



  private async unlockAchievements(
    tx: any,
    userId: string,
    type: string,
    value: number,
  ) {
    const achievements = await tx.achievement.findMany({
      where: {
        type,
        requirement: {
          lte: value,
        },
      },
    });

    const unlockedAchievements: typeof achievements = [];

    for (const achievement of achievements) {
      const alreadyUnlocked = await tx.userAchievement.findUnique({
        where: {
          userId_achievementId: {
            userId,
            achievementId: achievement.id,
          },
        },
      });

      if (!alreadyUnlocked) {
        const unlocked = await tx.userAchievement.create({
          data: {
            userId,
            achievementId: achievement.id,
          },
          select: {
            achievement: true,
          },
        });

        unlockedAchievements.push(unlocked.achievement);
      }
    }

    return unlockedAchievements;
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

    // Cada minuto estudado = 1 IGNIS
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



      const completedCycles = await tx.studyCycle.count({
        where: {
          userId,
          completed: true,
        },
      });



      const totalStudyMinutes = await tx.studyCycle.aggregate({
        where: {
          userId,
          completed: true,
        },
        _sum: {
          durationMinutes: true,
        },
      });

      const totalMinutes =
        totalStudyMinutes._sum.durationMinutes ?? 0;



      const cycleAchievements = await this.unlockAchievements(
        tx,
        userId,
        'CYCLES',
        completedCycles,
      );



      const minuteAchievements = await this.unlockAchievements(
        tx,
        userId,
        'MINUTES',
        totalMinutes,
      );



      const unlockedAchievements = [
        ...cycleAchievements,
        ...minuteAchievements,
      ];



      return {
        cycle: completedCycle,
        user: updatedUser,
        achievements: unlockedAchievements,
      };
    });

    return result;
  }
}

