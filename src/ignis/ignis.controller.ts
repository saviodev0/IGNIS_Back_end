import { Body, Controller, Get, Post } from '@nestjs/common';
import { IgnisService } from './ignis.service';
import { RouteIntentDto } from './dto/route-intent.dto';

@Controller('ignis')
export class IgnisController {
  constructor(private readonly ignisService: IgnisService) {}

  @Get()
  getIgnis() {
    return this.ignisService.getInfo();
  }

  @Post('intent')
  routeIntent(@Body() body: RouteIntentDto) {
    return this.ignisService.routeIntent(body.message);
  }
}
