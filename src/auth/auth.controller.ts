
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post('register')
  async register(
    @Body('name') name: string,
    @Body('age') age: number,
    @Body('email') email: string,
    @Body('isStudent') isStudent: boolean,
    @Body('whichCourse') whichCourse: string,
    @Body('phone') phone: string,
    @Body('password') password: string,
  ) {
    return this.authService.register(
      name,
      Number(age),
      email,
      isStudent,
      whichCourse,
      phone,
      password,
    );
  }

  @Post('login')
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      email,
      password,
    );

    response.cookie('ignis_token', result.accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() request: any) {
    return this.authService.getMe(
      request.user.sub,
    );
  }

  @Post('logout')
  logout(
    @Res({ passthrough: true }) response: Response,
  ) {
    response.clearCookie('ignis_token');

    return {
      message: 'Logout realizado com sucesso',
    };
  }
}

