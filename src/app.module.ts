import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IgnisModule } from './ignis/ignis.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { StudyCyclesModule } from './study-cycles/study-cycles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    IgnisModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    StudyCyclesModule,
  ],

  controllers: [AppController],

  providers: [AppService],
})
export class AppModule {}