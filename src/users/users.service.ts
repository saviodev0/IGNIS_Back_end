import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RankingQueryDto } from './dto/ranking-query.dto';
import {
  calculateStudyStreaks,
  getLocalDateKey,
} from '../study-cycles/study-day.utils';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async ranking(userId: string, query?: RankingQueryDto) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [users, total, currentUser] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: [{ ignisPoints: 'desc' }, { id: 'asc' }],
        skip,
        take: limit,
        select: { id: true, name: true, ignisPoints: true },
      }),
      this.prisma.user.count(),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          ignisPoints: true,
        },
      }),
    ]);

    if (!currentUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const usersAhead = await this.prisma.user.count({
      where: {
        OR: [
          { ignisPoints: { gt: currentUser.ignisPoints } },
          {
            ignisPoints: currentUser.ignisPoints,
            id: { lt: currentUser.id },
          },
        ],
      },
    });

    return {
      data: users.map((user: any, index: number) => ({
        position: skip + index + 1,
        id: user.id,
        name: user.name,
        ignisPoints: user.ignisPoints,
      })),
      currentUser: {
        id: currentUser.id,
        name: currentUser.name,
        ignisPoints: currentUser.ignisPoints,
        position: usersAhead + 1,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =========================
  // CRIAR USUÁRIO
  // =========================

  async create(createUserDto: CreateUserDto) {
    const {
      name,
      age,
      email,
      phone,
      password,
    } = createUserDto;

    const existingUser =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
      });

    if (existingUser) {
      throw new ConflictException(
        'E-mail já cadastrado',
      );
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        name,
        age,
        email,
        phone,
        password: passwordHash,
      },
    });

    const {
      password: _,
      ...userWithoutPassword
    } = user;

    return userWithoutPassword;
  }

  // =========================
  // ATUALIZAR USUÁRIO
  // =========================

  async update(
    userId: string,
    updateUserDto: UpdateUserDto,
  ) {
    const {
      name,
      age,
      email,
      phone,
      password,
    } = updateUserDto;

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado',
      );
    }

    // Verifica se o novo e-mail já pertence
    // a outro usuário
    if (email && email !== user.email) {
      const emailExists =
        await this.prisma.user.findUnique({
          where: {
            email,
          },
        });

      if (emailExists) {
        throw new ConflictException(
          'E-mail já cadastrado',
        );
      }
    }

    // Criptografa a nova senha
    let passwordHash: string | undefined;

    if (password) {
      passwordHash =
        await bcrypt.hash(password, 12);
    }

    const updatedUser =
      await this.prisma.user.update({
        where: {
          id: userId,
        },

        data: {
          ...(name !== undefined && {
            name,
          }),

          ...(age !== undefined && {
            age,
          }),

          ...(email !== undefined && {
            email,
          }),

          ...(phone !== undefined && {
            phone,
          }),

          ...(passwordHash !== undefined && {
            password: passwordHash,
          }),
        },

        select: {
          id: true,
          name: true,
          age: true,
          email: true,
          phone: true,
          ignisPoints: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    return {
      message: 'Perfil atualizado com sucesso',
      user: updatedUser,
    };
  }

  // =========================
  // BUSCAR MEU PERFIL
  // =========================

  async getMe(userId: string) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },

        select: {
          id: true,
          name: true,
          age: true,
          email: true,
          phone: true,
          ignisPoints: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado',
      );
    }

    return user;
  }

  // =========================
  // ATUALIZAR MEU PERFIL
  // =========================

  async updateMe(
    userId: string,
    name?: string,
    age?: number,
    phone?: string,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado',
      );
    }

    const updatedUser =
      await this.prisma.user.update({
        where: {
          id: userId,
        },

        data: {
          ...(name !== undefined && {
            name,
          }),

          ...(age !== undefined && {
            age,
          }),

          ...(phone !== undefined && {
            phone,
          }),
        },

        select: {
          id: true,
          name: true,
          age: true,
          email: true,
          phone: true,
          ignisPoints: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    return {
      message:
        'Perfil atualizado com sucesso',

      user: updatedUser,
    };
  }

  // =========================
  // ALTERAR SENHA
  // =========================

  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado',
      );
    }

    const passwordIsValid =
      await bcrypt.compare(
        currentPassword,
        user.password,
      );

    if (!passwordIsValid) {
      throw new ConflictException(
        'A senha atual está incorreta',
      );
    }

    const newPasswordHash =
      await bcrypt.hash(
        newPassword,
        12,
      );

    await this.prisma.user.update({
      where: {
        id: userId,
      },

      data: {
        password: newPasswordHash,
      },
    });

    return {
      message: 'Senha alterada com sucesso',
    };
  }

  // =========================
  // ESTATÍSTICAS
  // =========================

  async getStats(userId: string) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },

        select: {
          id: true,
          name: true,
          email: true,
          ignisPoints: true,

          studyCycles: {
            where: {
              completed: true,
            },

            select: {
              durationMinutes: true,
              completedAt: true,
            },

            orderBy: {
              completedAt: 'asc',
            },
          },
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado',
      );
    }

    const completedCycles =
      user.studyCycles.length;

    const totalStudyMinutes =
      user.studyCycles.reduce(
        (total, cycle) =>
          total + cycle.durationMinutes,
        0,
      );

    const now = new Date();
    const todayKey = getLocalDateKey(now);
    const dailyTotals = new Map<
      string,
      { totalMinutes: number; completedCycles: number }
    >();

    for (const cycle of user.studyCycles) {
      if (!cycle.completedAt) {
        continue;
      }

      const date = getLocalDateKey(cycle.completedAt);
      const totals = dailyTotals.get(date) ?? {
        totalMinutes: 0,
        completedCycles: 0,
      };
      totals.totalMinutes += cycle.durationMinutes;
      totals.completedCycles++;
      dailyTotals.set(date, totals);
    }

    const todayTotals = dailyTotals.get(todayKey) ?? {
      totalMinutes: 0,
      completedCycles: 0,
    };
    const dailyStudy = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 6 + index,
        12,
      );
      const dateKey = getLocalDateKey(date);
      const totals = dailyTotals.get(dateKey);

      return {
        date: dateKey,
        totalMinutes: totals?.totalMinutes ?? 0,
        completedCycles: totals?.completedCycles ?? 0,
      };
    });
    const { currentStreak, longestStreak } = calculateStudyStreaks(
      user.studyCycles.map((cycle) => cycle.completedAt),
      now,
    );

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },

      stats: {
        ignisPoints: user.ignisPoints,
        totalStudyMinutes,
        completedCycles,
        todayStudyMinutes: todayTotals.totalMinutes,
        todayCompletedCycles: todayTotals.completedCycles,
        currentStreak,
        longestStreak,
        dailyStudy,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };
  }
}