
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { GoalsService } from './goals.service';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('goals')
export class GoalsController {
  constructor(
    private readonly goalsService: GoalsService,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  async create(
    @Req() request: any,
    @Body('type') type: string,
    @Body('targetMinutes') targetMinutes: number,
  ) {
    return this.goalsService.create(
      request.user.sub,
      type,
      targetMinutes,
    );
  }

  @Get()
  @UseGuards(AuthGuard)
  async findAll(@Req() request: any) {
    return this.goalsService.findAll(
      request.user.sub,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async findOne(
    @Req() request: any,
    @Param('id') id: string,
  ) {
    return this.goalsService.findOne(
      request.user.sub,
      Number(id),
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async remove(
    @Req() request: any,
    @Param('id') id: string,
  ) {
    return this.goalsService.remove(
      request.user.sub,
      Number(id),
    );
  }
}

