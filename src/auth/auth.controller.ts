
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { authCookieOptions } from '../config/env';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
      ...authCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() request: AuthenticatedRequest) {
    return this.authService.getMe(
      request.user.sub,
    );
  }

  @Post('logout')
  logout(
    @Res({ passthrough: true }) response: Response,
  ) {
    response.clearCookie('ignis_token', authCookieOptions());

    return {
      message: 'Logout realizado com sucesso',
    };
  }
}

