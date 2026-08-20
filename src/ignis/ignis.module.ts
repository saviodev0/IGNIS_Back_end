import { Module } from '@nestjs/common';
import { IgnisController } from './ignis.controller';
import { IgnisService } from './ignis.service';

@Module({
  controllers: [IgnisController],
  providers: [IgnisService]
})
export class IgnisModule {}
