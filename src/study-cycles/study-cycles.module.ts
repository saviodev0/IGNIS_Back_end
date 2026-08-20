import { Module } from '@nestjs/common';

import { StudyCyclesController } from './study-cycles.controller';
import { StudyCyclesService } from './study-cycles.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StudyCyclesController],
  providers: [StudyCyclesService],
})
export class StudyCyclesModule {}