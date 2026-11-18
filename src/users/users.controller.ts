import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { RankingQueryDto } from './dto/ranking-query.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Post()
  async create(
    @Body() createUserDto: CreateUserDto,
  ) {
    return this.usersService.create(
      createUserDto,
    );
  }

  @Get('me/stats')
  @UseGuards(AuthGuard)
  async getStats(@Req() request: AuthenticatedRequest) {
    return this.usersService.getStats(request.user.sub);
  }

  @Get('ranking')
  @UseGuards(AuthGuard)
  async ranking(
    @Req() request: AuthenticatedRequest,
    @Query() query: RankingQueryDto,
  ) {
    return this.usersService.ranking(request.user.sub, query);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  async update(@Req() request: AuthenticatedRequest, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(request.user.sub, updateUserDto);
  }
}