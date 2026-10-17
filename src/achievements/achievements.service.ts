
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
        },
      });

    const unlockedIds = new Set(
      userAchievements.map(
        (userAchievement) => userAchievement.achievementId,
      ),
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

    const studyDays: number[] = [
      ...new Set<number>(
        cycles
          .filter((cycle) => cycle.completedAt)
          .map((cycle) => {
            const date = new Date(cycle.completedAt!);

            return new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate(),
            ).getTime();
          }),
      ),
    ].sort((a: number, b: number) => b - a);

    let longestStreak = 0;

    if (studyDays.length > 0) {
      let streak = 1;
      longestStreak = 1;

      const oneDay = 1000 * 60 * 60 * 24;

      for (let i = 1; i < studyDays.length; i++) {
        const difference = Math.round(
          (studyDays[i - 1] - studyDays[i]) / oneDay,
        );

        if (difference === 1) {
          streak++;
        } else {
          streak = 1;
        }

        if (streak > longestStreak) {
          longestStreak = streak;
        }
      }
    }

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
        unlocked: unlockedIds.has(achievement.id),
      };
    });
  }
}

