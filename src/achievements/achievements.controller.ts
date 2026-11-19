
import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AchievementsService } from './achievements.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('achievements')
export class AchievementsController {
  constructor(
    private readonly achievementsService: AchievementsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async findAll(@Req() request: AuthenticatedRequest) {
    return this.achievementsService.findAll(
      request.user.sub,
    );
  }
}

