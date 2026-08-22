import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  Param,
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

  @Post(':id/complete')
@UseGuards(AuthGuard)
async complete(
  @Req() request: any,
  @Param('id') id: string,
) {
  return this.studyCyclesService.complete(
    Number(id),
    request.user.sub,
  );
}
}