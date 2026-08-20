import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { StudyCyclesService } from './study-cycles.service';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('study-cycles')
export class StudyCyclesController {
  constructor(
    private readonly studyCyclesService: StudyCyclesService,
  ) {}

  @Post('start')
  @UseGuards(AuthGuard)
  async start(
    @Req() request: any,
    @Body('durationMinutes') durationMinutes: number,
  ) {
    return this.studyCyclesService.start(
      request.user.sub,
      durationMinutes,
    );
  }
}