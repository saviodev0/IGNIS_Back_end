
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calculateStudyStreaks } from '../study-cycles/study-day.utils';

@Injectable()
export class AchievementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const achievements = await this.prisma.achievement.findMany({
      orderBy: {
        requirement: 'asc',
      },
    });

    const userAchievements =
      await this.prisma.userAchievement.findMany({
        where: {
          userId,
        },
        select: {
          achievementId: true,
          unlockedAt: true,
        },
      });

    const unlockDates = new Map(
      userAchievements.map((userAchievement) => [
        userAchievement.achievementId,
        userAchievement.unlockedAt,
      ]),
    );

    const cycles = await this.prisma.studyCycle.findMany({
      where: {
        userId,
        completed: true,
      },
      select: {
        durationMinutes: true,
        completedAt: true,
      },
    });

    const completedCycles = cycles.length;

    const totalStudyMinutes = cycles.reduce(
      (total, cycle) => total + cycle.durationMinutes,
      0,
    );

    const { longestStreak } = calculateStudyStreaks(
      cycles.map((cycle) => cycle.completedAt),
    );

    return achievements.map((achievement) => {
      let progress = 0;

      if (achievement.type === 'CYCLES') {
        progress = completedCycles;
      }

      if (achievement.type === 'MINUTES') {
        progress = totalStudyMinutes;
      }

      if (achievement.type === 'STREAK') {
        progress = longestStreak;
      }

      return {
        id: achievement.id,
        code: achievement.code,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        type: achievement.type,
        requirement: achievement.requirement,
        progress: Math.min(
          progress,
          achievement.requirement,
        ),
        unlocked: unlockDates.has(achievement.id),
        unlockedAt: unlockDates.get(achievement.id) ?? null,
      };
    });
  }
}
