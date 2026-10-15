
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { StudyHistoryQueryDto } from './dto/study-history-query.dto';
import { calculateStudyStreaks } from './study-day.utils';

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
    



  async history(userId: string, query?: StudyHistoryQueryDto) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
    const startDate = query?.startDate
      ? new Date(query.startDate)
      : undefined;
    const endDate = query?.endDate
      ? new Date(query.endDate)
      : undefined;

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        'startDate deve ser anterior ou igual a endDate.',
      );
    }

    const completedAt =
      startDate || endDate
        ? {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          }
        : undefined;

    const where = {
      userId,
      ...(completedAt ? { completedAt } : {}),
    };
    const completedWhere = {
      ...where,
      completed: true,
    };

    const [cycles, total, aggregate] = await Promise.all([
      this.prisma.studyCycle.findMany({
        where,
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          durationMinutes: true,
          startedAt: true,
          completedAt: true,
          ignisEarned: true,
          completed: true,
        },
      }),
      this.prisma.studyCycle.count({ where }),
      this.prisma.studyCycle.aggregate({
        where: completedWhere,
        _sum: {
          durationMinutes: true,
          ignisEarned: true,
        },
        _avg: {
          durationMinutes: true,
        },
      }),
    ]);

    return {
      data: cycles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalStudyMinutes: aggregate._sum.durationMinutes ?? 0,
        totalIgnisEarned: aggregate._sum.ignisEarned ?? 0,
        averageStudyMinutes: Math.round(
          aggregate._avg.durationMinutes ?? 0,
        ),
      },
    };
}


    


async stats(userId: string) {
  const cycles = await this.prisma.studyCycle.findMany({
    where: {
      userId,
      completed: true,
    },
    select: {
      durationMinutes: true,
      ignisEarned: true,
      completedAt: true,
    },
  });

  const completedCycles = cycles.length;

  const totalStudyMinutes = cycles.reduce(
    (total, cycle) => total + cycle.durationMinutes,
    0,
  );

  const totalIgnisEarned = cycles.reduce(
    (total, cycle) => total + cycle.ignisEarned,
    0,
  );

  const averageStudyMinutes =
    completedCycles > 0
      ? Math.round(totalStudyMinutes / completedCycles)
      : 0;

  

  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const todayCycles = cycles.filter((cycle) => {
    if (!cycle.completedAt) {
      return false;
    }

    const completedAt = new Date(cycle.completedAt);

    return (
      completedAt >= startOfToday &&
      completedAt <= endOfToday
    );
  });

  const todayStudyMinutes = todayCycles.reduce(
    (total, cycle) => total + cycle.durationMinutes,
    0,
  );

  

  const startOfWeek = new Date(now);

  const dayOfWeek = startOfWeek.getDay();

  const differenceToMonday =
    dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  startOfWeek.setDate(
    startOfWeek.getDate() - differenceToMonday,
  );

  startOfWeek.setHours(0, 0, 0, 0);

  const weekCycles = cycles.filter((cycle) => {
    if (!cycle.completedAt) {
      return false;
    }

    const completedAt = new Date(cycle.completedAt);

    return completedAt >= startOfWeek;
  });

  const weekStudyMinutes = weekCycles.reduce(
    (total, cycle) => total + cycle.durationMinutes,
    0,
  );

  

  const { currentStreak, longestStreak } = calculateStudyStreaks(
    cycles.map((cycle) => cycle.completedAt),
    now,
  );

  return {
    totalStudyMinutes,
    completedCycles,
    totalIgnisEarned,
    averageStudyMinutes,
    todayStudyMinutes,
    weekStudyMinutes,
    currentStreak,
    longestStreak,
  };
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

    return calculateStudyStreaks(
      cycles.map((cycle: { completedAt: Date | null }) => cycle.completedAt),
    ).currentStreak;
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
                  //Incrementando points apos finalizar
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
