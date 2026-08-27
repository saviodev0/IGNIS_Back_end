
import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}


  async remove(userId: string, goalId: number) {
  const goal = await this.prisma.goal.findFirst({
    where: {
      id: goalId,
      userId,
    },
  });

  if (!goal) {
    throw new BadRequestException(
      'Meta não encontrada.',
    );
  }

  await this.prisma.goal.delete({
    where: {
      id: goalId,
    },
  });

  return {
    message: 'Meta excluída com sucesso.',
  };
}


  async create(
    userId: string,
    type: string,
    targetMinutes: number,
  ) {
    if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(type)) {
      throw new BadRequestException(
        'Tipo de meta inválido. Use DAILY, WEEKLY ou MONTHLY.',
      );
    }

    if (!targetMinutes || targetMinutes <= 0) {
      throw new BadRequestException(
        'targetMinutes deve ser maior que zero.',
      );
    }

    
const existingGoal = await this.prisma.goal.findFirst({
  where: {
    userId,
    type,
    completed: false,
    startDate: {
      lte: new Date(),
    },
    endDate: {
      gte: new Date(),
    },
  },
});

if (existingGoal) {
  throw new BadRequestException(
    `Você já possui uma meta ${type.toLowerCase()} ativa.`,
  );
}



    const now = new Date();

    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);

    if (type === 'DAILY') {
      endDate.setHours(23, 59, 59, 999);
    }

    if (type === 'WEEKLY') {
      const dayOfWeek = endDate.getDay();

      const daysUntilSunday =
        dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

      endDate.setDate(
        endDate.getDate() + daysUntilSunday,
      );

      endDate.setHours(23, 59, 59, 999);
    }

    if (type === 'MONTHLY') {
      endDate.setMonth(
        endDate.getMonth() + 1,
      );

      endDate.setDate(0);

      endDate.setHours(23, 59, 59, 999);
    }

    return this.prisma.goal.create({
      data: {
        userId,
        type,
        targetMinutes,
        startDate,
        endDate,
      },
    });
  }

  async findAll(userId: string) {
    const goals = await this.prisma.goal.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return Promise.all(
      goals.map(async (goal) => {
        const cycles =
          await this.prisma.studyCycle.findMany({
            where: {
              userId,
              completed: true,
              completedAt: {
                gte: goal.startDate,
                lte: goal.endDate,
              },
            },
            select: {
              durationMinutes: true,
            },
          });

        const progressMinutes = cycles.reduce(
          (total, cycle) =>
            total + cycle.durationMinutes,
          0,
        );

        const progressPercent =
          goal.targetMinutes > 0
            ? Math.min(
                Math.round(
                  (progressMinutes /
                    goal.targetMinutes) *
                    100,
                ),
                100,
              )
            : 0;

        const completed =
          progressMinutes >=
          goal.targetMinutes;

        return {
          id: goal.id,
          type: goal.type,
          targetMinutes:
            goal.targetMinutes,
          startDate: goal.startDate,
          endDate: goal.endDate,
          progressMinutes,
          progressPercent,
          completed,
          createdAt: goal.createdAt,
        };
      }),
    );
  }

  
async findOne(userId: string, goalId: number) {
  const goal = await this.prisma.goal.findFirst({
    where: {
      id: goalId,
      userId,
    },
  });

  if (!goal) {
    throw new BadRequestException(
      'Meta não encontrada.',
    );
  }

  

  const cycles = await this.prisma.studyCycle.findMany({
    where: {
      userId,
      completed: true,
      completedAt: {
        gte: goal.startDate,
        lte: goal.endDate,
      },
    },
    select: {
      durationMinutes: true,
    },
  });

  const progressMinutes = cycles.reduce(
    (total, cycle) =>
      total + cycle.durationMinutes,
    0,
  );

  const progressPercent =
    goal.targetMinutes > 0
      ? Math.min(
          Math.round(
            (progressMinutes / goal.targetMinutes) * 100,
          ),
          100,
        )
      : 0;

  const completed =
    progressMinutes >= goal.targetMinutes;







  return {
    id: goal.id,
    type: goal.type,
    targetMinutes: goal.targetMinutes,
    startDate: goal.startDate,
    endDate: goal.endDate,
    progressMinutes,
    progressPercent,
    completed,
    createdAt: goal.createdAt,
  };
}


}

