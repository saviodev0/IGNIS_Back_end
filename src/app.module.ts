import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IgnisModule } from './ignis/ignis.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { StudyCyclesModule } from './study-cycles/study-cycles.module';
import { AchievementsModule } from './achievements/achievements.module';
import { GoalsModule } from './goals/goals.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Limite geral por IP; login, cadastro e chat têm limites mais baixos (@Throttle)
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      errorMessage: 'Muitas requisições. Aguarde um instante e tente novamente.',
    }),

    IgnisModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    StudyCyclesModule,
    AchievementsModule,
    GoalsModule,
    ChatModule,
  ],

  controllers: [AppController],

  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}