
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from '../users/dto/create-user.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: CreateUserDto) {
    const { name, age, email, phone, password } = dto;
    const isStudent = dto.isStudent ?? false;
    const whichCourse = dto.whichCourse ?? '';

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'Este e-mail já está cadastrado',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
  data: {
    name,
    age,
    isStudent,
    whichCourse,
    email,
    phone,
    password: hashedPassword,
  },
  select: {
    id: true,
    name: true,
    age: true,
    isStudent: true,
    whichCourse: true,
    email: true,
    phone: true,
    createdAt: true,
  },
});

    return {
      message: 'Usuário criado com sucesso',
      user,
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'E-mail ou senha inválidos',
      );
    }

    const passwordIsValid = await bcrypt.compare(
      password,
      user.password,
    );

    if (!passwordIsValid) {
      throw new UnauthorizedException(
        'E-mail ou senha inválidos',
      );
    }

    const payload = {
      sub: user.id,
      email: user.email,
    };

    const accessToken =
      await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        age: user.age,
        email: user.email,
        phone: user.phone,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        age: true,
        email: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Usuário não encontrado',
      );
    }

    return user;
  }
}

