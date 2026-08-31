import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  

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

    

    const studyDates: number[] = [
      ...new Set<number>(
        user.studyCycles
          .filter(
            (cycle) => cycle.completedAt,
          )
          .map((cycle) => {
            const date = new Date(
              cycle.completedAt!,
            );

            return new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate(),
            ).getTime();
          }),
      ),
    ].sort((a, b) => a - b);

    

    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 0;

    for (
      let i = 0;
      i < studyDates.length;
      i++
    ) {
      if (i === 0) {
        streak = 1;
      } else {
        const previousDate =
          studyDates[i - 1];

        const currentDate =
          studyDates[i];

        const differenceInDays =
          (currentDate - previousDate) /
          (1000 * 60 * 60 * 24);

        if (differenceInDays === 1) {
          streak++;
        } else {
          streak = 1;
        }
      }

      if (streak > longestStreak) {
        longestStreak = streak;
      }
    }

    

    if (studyDates.length > 0) {
      const today = new Date();

      const todayStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime();

      const yesterdayStart =
        todayStart -
        1000 * 60 * 60 * 24;

      const lastStudyDate =
        studyDates[
          studyDates.length - 1
        ];

      if (
        lastStudyDate === todayStart ||
        lastStudyDate === yesterdayStart
      ) {
        currentStreak = 1;

        for (
          let i =
            studyDates.length - 1;
          i > 0;
          i--
        ) {
          const differenceInDays =
            (studyDates[i] -
              studyDates[i - 1]) /
            (1000 * 60 * 60 * 24);

          if (differenceInDays === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }
    }

    

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
        currentStreak,
        longestStreak,
      },
    };
  }
}