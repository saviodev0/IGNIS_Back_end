
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

import { CreateGoalDto } from './dto/create-goal.dto';
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

