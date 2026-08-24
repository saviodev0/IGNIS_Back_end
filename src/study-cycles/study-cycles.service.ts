
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

    const unlockedAchievements: any[] = [];

    for (const achievement of achievements) {
      const alreadyUnlocked =
        await tx.userAchievement.findUnique({
          where: {
            userId_achievementId: {
              userId,
              achievementId: achievement.id,
            },
          },
        });

      if (!alreadyUnlocked) {
        const unlocked =
          await tx.userAchievement.create({
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



  private async calculateCurrentStreak(
    tx: any,
    userId: string,
  ): Promise<number> {
    const cycles = await tx.studyCycle.findMany({
      where: {
        userId,
        completed: true,
      },
      select: {
        completedAt: true,
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    if (cycles.length === 0) {
      return 0;
    }

    const studyDays: number[] = [
      ...new Set<number>(
        cycles
          .filter((cycle: any) => cycle.completedAt)
          .map((cycle: any) => {
            const date = new Date(cycle.completedAt);

            return new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate(),
            ).getTime();
          }),
      ),
    ];

    studyDays.sort(
      (a: number, b: number) => b - a,
    );

    if (studyDays.length === 0) {
      return 0;
    }

    const oneDay =
      1000 * 60 * 60 * 24;

    let streak = 1;

    for (
      let i = 1;
      i < studyDays.length;
      i++
    ) {
      const difference =
        (studyDays[i - 1] - studyDays[i]) /
        oneDay;

      if (difference === 1) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }



  async complete(
    cycleId: number,
    userId: string,
  ) {
    const cycle =
      await this.prisma.studyCycle.findFirst({
        where: {
          id: cycleId,
          userId,
        },
      });

    if (!cycle) {
      throw new NotFoundException(
        'Ciclo não encontrado',
      );
    }

    if (cycle.completed) {
      throw new ConflictException(
        'Este ciclo já foi concluído',
      );
    }

    const ignisEarned =
      cycle.durationMinutes;

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          

          const completedCycle =
            await tx.studyCycle.update({
              where: {
                id: cycle.id,
              },
              data: {
                completed: true,
                completedAt: new Date(),
                ignisEarned,
              },
            });

          

          const updatedUser =
            await tx.user.update({
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

          

          const completedCycles =
            await tx.studyCycle.count({
              where: {
                userId,
                completed: true,
              },
            });

          

          const totalStudyMinutes =
            await tx.studyCycle.aggregate({
              where: {
                userId,
                completed: true,
              },
              _sum: {
                durationMinutes: true,
              },
            });

          const totalMinutes =
            totalStudyMinutes._sum
              .durationMinutes ?? 0;

          

          const cycleAchievements =
            await this.unlockAchievements(
              tx,
              userId,
              'CYCLES',
              completedCycles,
            );

          

          const minuteAchievements =
            await this.unlockAchievements(
              tx,
              userId,
              'MINUTES',
              totalMinutes,
            );

          

          const currentStreak =
            await this.calculateCurrentStreak(
              tx,
              userId,
            );

          

          const streakAchievements =
            await this.unlockAchievements(
              tx,
              userId,
              'STREAK',
              currentStreak,
            );

          

          const unlockedAchievements = [
            ...cycleAchievements,
            ...minuteAchievements,
            ...streakAchievements,
          ];

          

          return {
            cycle: completedCycle,
            user: updatedUser,
            currentStreak,
            achievements:
              unlockedAchievements,
          };
        },
      );

    return result;
  }
}

