
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { CreateGoalDto } from './dto/create-goal.dto';
import { GoalsService } from './goals.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('goals')
export class GoalsController {
  constructor(
    private readonly goalsService: GoalsService,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateGoalDto,
  ) {
    return this.goalsService.create(
      request.user.sub,
      dto.type,
      dto.targetMinutes,
    );
  }

  @Get()
  @UseGuards(AuthGuard)
  async findAll(@Req() request: AuthenticatedRequest) {
    return this.goalsService.findAll(
      request.user.sub,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.goalsService.findOne(
      request.user.sub,
      id,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.goalsService.remove(
      request.user.sub,
      id,
    );
  }
}

