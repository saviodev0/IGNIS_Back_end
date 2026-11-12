import {
  Body,
  Controller,
  Post,
  Patch,
  Get,
  Req,
  Query,
  UseGuards,
  Param,
  ParseIntPipe,
} from '@nestjs/common';

import { StudyCyclesService } from './study-cycles.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { StudyHistoryQueryDto } from './dto/study-history-query.dto';

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
    @Body('title') title?: unknown,
  ) {
    return this.studyCyclesService.start(
      request.user.sub,
      durationMinutes,
      title,
    );
  }

  @Get('active')
  @UseGuards(AuthGuard)
  async active(@Req() request: any) {
    return this.studyCyclesService.active(request.user.sub);
  }

  @Post(':id/pause')
  @UseGuards(AuthGuard)
  async pause(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.studyCyclesService.pause(id, request.user.sub);
  }

  @Post(':id/resume')
  @UseGuards(AuthGuard)
  async resume(@Req() request: any, @Param('id', ParseIntPipe) id: number) {
    return this.studyCyclesService.resume(id, request.user.sub);
  }

  @Patch(':id/title')
  @UseGuards(AuthGuard)
  async rename(
    @Req() request: any,
    @Param('id', ParseIntPipe) id: number,
    @Body('title') title?: unknown,
  ) {
    return this.studyCyclesService.rename(id, request.user.sub, title);
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


@Get('history')
@UseGuards(AuthGuard)
async history(
  @Req() request: any,
  @Query() query: StudyHistoryQueryDto,
) {
  return this.studyCyclesService.history(
    request.user.sub,
    query,
  );
}


@Get('stats')
@UseGuards(AuthGuard)
async stats(@Req() request: any) {
  return this.studyCyclesService.stats(
    request.user.sub,
  );
}






}