import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { UpdatePasswordDto } from './dto/update-password.dto';

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
  async getStats(@Req() request: any) {
    return this.usersService.getStats(request.user.sub);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  async update(@Req() request: any, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(request.user.sub, updateUserDto);
  }
}