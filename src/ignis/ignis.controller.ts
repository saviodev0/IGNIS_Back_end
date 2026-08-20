import { Controller, Get } from '@nestjs/common';
import { IgnisService } from './ignis.service';

@Controller('ignis')
export class IgnisController {
  constructor(private readonly ignisService: IgnisService) {}

  @Get()
  getIgnis() {
    return this.ignisService.getInfo();
  }
}