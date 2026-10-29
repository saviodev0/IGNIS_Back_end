import { Module } from '@nestjs/common';

import { StudyCyclesController } from './study-cycles.controller';
import { StudyCyclesService } from './study-cycles.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StudyCyclesController],
  providers: [StudyCyclesService],
  exports: [StudyCyclesService],
})
export class StudyCyclesModule {}