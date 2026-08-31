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
    return this.usersService.getStats(
      request.user.sub,
    );
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getMe(@Req() request: any) {
    return this.usersService.getMe(
      request.user.sub,
    );
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  async updateMe(
    @Req() request: any,
    @Body('name') name?: string,
    @Body('age') age?: number,
    @Body('phone') phone?: string,
  ) {
    return this.usersService.updateMe(
      request.user.sub,
      name,
      age,
      phone,
    );
  }

  @Patch('me/password')
@UseGuards(AuthGuard)
async updatePassword(
  @Req() request: any,
  @Body() updatePasswordDto: UpdatePasswordDto,
) {
  return this.usersService.updatePassword(
    request.user.sub,
    updatePasswordDto.currentPassword,
    updatePasswordDto.newPassword,
  );
}
}