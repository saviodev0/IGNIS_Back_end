
import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AchievementsService } from './achievements.service';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('achievements')
export class AchievementsController {
  constructor(
    private readonly achievementsService: AchievementsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async findAll(@Req() request: any) {
    return this.achievementsService.findAll(
      request.user.sub,
    );
  }
}

