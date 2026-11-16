import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { StudyCyclesModule } from '../study-cycles/study-cycles.module';
import { GoalsModule } from '../goals/goals.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { FileTextService } from './file-text.service';
import { EmbeddingService } from './embedding.service';
import { FileStorageService } from './file-storage.service';
import { GroqService } from './groq.service';
import { StudentContextService } from './student-context.service';
import { IntentRouterService } from './intent-router.service';
import { DirectAnswerService } from './direct-answer.service';
import { Chat, ChatSchema } from './schemas/chat.schema';
import { ChatMessage, ChatMessageSchema } from './schemas/message.schema';
import { ChatFile, ChatFileSchema } from './schemas/chat-file.schema';
import { StudyMaterial, StudyMaterialSchema } from './schemas/study-material.schema';
import { MaterialService } from './material.service';
import { CycleTitleService } from './cycle-title.service';
import { UsageService } from './usage.service';
import { PrivacyService } from './privacy.service';
import { OcrService } from './ocr.service';
import { AiUsage, AiUsageSchema } from './schemas/ai-usage.schema';
import { AiMetric, AiMetricSchema } from './schemas/ai-metric.schema';
import { AiMetricsService } from './ai-metrics.service';
import { AiMetricsController } from './ai-metrics.controller';
import { MetricsGuard } from './metrics.guard';

@Module({
  imports: [
    AuthModule,
    StudyCyclesModule,
    GoalsModule,

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri:
          config.get<string>('MONGODB_URL') ??
          'mongodb://ignis:ignis_dev_password@localhost:27017/ignis?authSource=admin',
      }),
    }),

    MongooseModule.forFeature([
      { name: Chat.name, schema: ChatSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: ChatFile.name, schema: ChatFileSchema },
      { name: StudyMaterial.name, schema: StudyMaterialSchema },
      { name: AiUsage.name, schema: AiUsageSchema },
      { name: AiMetric.name, schema: AiMetricSchema },
    ]),
  ],
  controllers: [ChatController, AiMetricsController],
  providers: [
    ChatService,
    MaterialService,
    CycleTitleService,
    UsageService,
    AiMetricsService,
    MetricsGuard,
    PrivacyService,
    OcrService,
    FileTextService,
    FileStorageService,
    EmbeddingService,
    GroqService,
    StudentContextService,
    IntentRouterService,
    DirectAnswerService,
  ],
})
export class ChatModule {}
